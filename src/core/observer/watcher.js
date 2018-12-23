/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
// 通过对被观测目标的求值(expOrFn)，触发数据属性的get拦截器函数从而收集依赖
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component, // 组件实例对象
    expOrFn: string | Function, // 待观察的表达式
    cb: Function, // 当被观察的表达式的值变化时的回调函数
    options?: ?Object, // 选项
    isRenderWatcher?: boolean // 当前观察者实例是否是渲染函数的观察者，只有在mountComponent中这个参数才是true
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this) // 组件的观察者可能有多个，包括渲染函数的观察者和非渲染函数的观察者
    // options
    if (options) {
      // 是否是深度观测，也就是通过watch属性，
      // 或者$watch函数进行观测时，可以设置deep属性为true来进行深度观测
      this.deep = !!options.deep
      // 用来标识当前观察者实例对象是开发者定义的还是内部定义的
      // 除了内部定义的观察者（渲染函数的观察者，或者计算属性的观察者），
      // 其他观察者都被认为是开发者定义的，此时user属性会自动被设置为true
      this.user = !!options.user
      this.lazy = !!options.lazy
      // 当数据变化时，是否同步求值并执行回调
      // 默认情况下，当数据变化时，不会同步求值并执行回调，
      // 而是将需要重新求值并执行回调的观察者放到一个异步队列中，
      // 当所有数据的变化结束之后统一求值并执行回调
      this.sync = !!options.sync
      // 在数据更新之后，触发更新之前执行的钩子函数
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    // 观察者实例对象的唯一标识
    this.id = ++uid // uid for batching
    // 当前观察者是否是激活状态，或者可用状态
    this.active = true
    // 是否是惰性求值
    this.dirty = this.lazy // for lazy watchers
    // 以下4个属性，用于避免重复收集依赖，并且能够去除无用依赖
    this.deps = [] // 保存上次收集的依赖集合
    this.newDeps = [] // 保存当次收集的依赖集合
    this.depIds = new Set() // 保存上次收集的依赖的id
    this.newDepIds = new Set() // 保存当次收集的依赖的id
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      // 如果这里this.getter为空，表示parsePath解析失败，
      // 说明取值表达式中包含了非法字符
      // 会在非生产环境中，给出错误提示
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get() // 最后这里调用了一次get方法
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // get方法的主要目的是求值，通过求值：
  // 第一是能够触发访问器属性的get拦截器函数，以此来收集依赖，
  // 第二是能够获得被观察目标的值
  get () {
    // pushTarget的目的是，
    // 为Dep对象设置target属性，以便正确执行get拦截器函数
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 这里又调用了expOrFn，也就是实例化Watcher时，传入的updateComponent
      // 而updateComponent的方法体就是：vm._update(vm._render(), hydrating)
      // 其实这行代码，最直观的理解就是对求值表达式的求值操作，
      // 而求值操作，才能触发数据属性的f拦截器函数
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 是否深度观测，如果是深度观测，
      // 那么就会递归地遍历value的所有属性，然后触发这些属性的get拦截器
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      // 每次求值结束以后，都会把当次收集的依赖newDeps通过deps保存起来,
      // 然后清空当次收集的依赖newDeps
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 下面的两层嵌套if语句就是用于过滤收集重复依赖
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    // 检查当次收集的依赖，是否存在于上次收集的依赖，
    // 如果不存在，则表示这个观察者和这个依赖之间没有任何联系到了，
    // 因此要清除掉
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 先把当次收集的依赖保存到deps字段，并清空当次依赖的集合newDepIds
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 触发重新求值
  update () {
    /* istanbul ignore else */
    // 是否是惰性求值，一般是计算属性的观察者
    if (this.lazy) {
      // 将dirty设置为true，表示计算属性还未求值
      this.dirty = true
    // 是否同步求值，渲染函数不是同步求值的，
    } else if (this.sync) {
      // 同步求值执行的是run方法，
      // 其实对于异步求值来说，同样也是调用这个方法
      this.run()
    // 对于渲染函数来说，观察到变化以后，
    // 不会同步求值，而是将变化添加到一个异步队列,
    // 也就是queueWatcher会把当前的观察者添加到一个异步更新队列。
    // 之所以这么做的原因是，当对象中有多个属性时，
    // 如果对这些属性依次进行修改，那么如果全部都同步求值，
    // 每次修改属性值，都要同步地重新渲染dom，这样做有严重的性能问题
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 实际执行更新变化操作的方法
  run () {
    // this.active字段用于标识当前的观察者对象是否处于激活状态，或可用状态
    if (this.active) {
      // 对于渲染函数来说，this.get的返回值总是undefined，
      // 因为渲染函数的目的是重新生成虚拟DOM，并更新真是DOM，
      // 因此this.get没有返回值
      const value = this.get()
      // 那么对于渲染函数来说，这个if条件判断总是为假，因为undefined === undefined，
      // 实际上下面的if条件判断是为非渲染函数的观察者准备的
      if (
        // 第一个条件是，上次求值结果和当次求值结果不相等
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        // 对于value是对象的情况来说，
        // 即使value === value也并不一定不触发更新，
        //
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // this.user为true，表示这个观察者是由开发者定义的，
        // 而由开发者定义的观察者可能会报错，因此这里try...catch一下，
        // 并给出错误提示
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    // 将dirty设置为false，表示对计算属性求过值了
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    // 判断当前的监听器是否处于激活状态
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 判断当前组件是否被销毁
      // 如果没有被销毁，则把当前监听器，从组件的监听器列表中删除
      // 由于这个操作的开销比较大，因此只有在当前组件被销毁的情况下才执行这个操作
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      // 由于当前watcher不再使用了，
      // 因此将当前watcher从与这个watcher相关联的Dep中全部删除
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      // 表示当前这个watcher不再处于激活状态
      this.active = false
    }
  }
}

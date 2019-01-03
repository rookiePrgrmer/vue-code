/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving, shouldObserve
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) { // 如果vm实例上有data属性
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  // 判断vue实例上是否设置了computed属性
  if (opts.computed) initComputed(vm, opts.computed)
  // 开始处理组件实例的watch属性
  // TODO nativeWatch?
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

/*
  propsOptions表示定义在组件props上的每个属性的属性参数，比如定义这个属性的类型，以及它的默认值
*/
function initProps (vm: Component, propsOptions: Object) {
  // propsData用来存放外界传递给组件的属性，propsData的创建依赖于编译器解析
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  // 是否是根组件
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 这个判断表示，只有不是根组件
  if (!isRoot) {
    // toggleObserving的作用是，切换observer类内部的shouldObserve变量true/false
    // 只有shouldObserve的值为true，才能对props上的对象数据属性进行深度响应式处理
    // 那么这样处理的原因是，设置到props上的对象数据本身，通常已经是响应式的了，因此无需重复响应式处理
    toggleObserving(false)
  }
  // 遍历开发者设置的props属性
  for (const key in propsOptions) {
    keys.push(key)
    // validateProp的作用是对相应的prop属性的类型进行验证，并返回开发者传递的prop属性值
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 只有Key不在组件实例对象上以及其原型链上没有定义时才会进行代理，
    // 这是一个针对子组件的优化操作，对于子组件来讲这个代理工作在创建子组件构造函数时就完成了，
    // 即在Vue.extend函数中完成的，这么做的目的是避免每次创建子组件实例时都会调用proxy函数组做代理，
    // 由于proxy函数中使用了Object.defineProperty函数，该函数的性能表现不佳，所以这么做能够提升一定的性能指标
    if (!(key in vm)) {
      // 这段代码的作用是，在vm组件实例上定义vm.props的同名属性，
      // 使得我们能够通过组件实例对象直接访问props数据，
      // 但其最终代理的值仍然是 vm._props 对象下定义的 props 数据
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  let data = vm.$options.data
  // 这里的 data 目前通常都是一个函数，返回一个 data 对象
  // 注意这里将data函数返回的对象又赋值给了 vm._data 属性
  data = vm._data = typeof data === 'function'
    ? getData(data, vm) // 这里调用我们自定义的data函数，获取其返回的data对象
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      // 保证methods上没有定义data的同名属性
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // 保证props上没有定义data的同名属性
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 如果满足了上面所有的限制条件，则把 _data 上定义的属性以 getter 、 setter 函数的形式绑定到 vm 实例上
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    // 这里可以看到，data函数是有一个入参的就是vm
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

// 初始化计算属性
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  // watchers和vm._computedWatchers用来存储计算属性的watcher
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    // 这个判断对应计算属性的两种写法：函数写法和对象写法，对象写法上需要定义get/set函数
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    // 非服务端渲染
    if (!isSSR) {
      // create internal watcher for the computed property.
      // 为每一个计算属性都创建了一个watcher，称之为计算属性的watcher
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        // 选项对象，就一个属性——lazy: true，
        // 用于标识这个watcher是一个计算属性watcher，
        // 因为计算属性的行为和菲计算属性的行为是不一样的
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 如果在data和props没有发现同名属性
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    // 如果计算属性的名称，已经被定义为了data或props，
    // 那么为了防止重名，会在非生产环境中给出错误提示
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 只有在非服务端渲染的情况下，才会缓存计算属性的值
  const shouldCache = !isServerRendering()
  // 判断计算属性的值是否是函数
  if (typeof userDef === 'function') {
    // 如果需要缓存，那么通过createComputedGetter生成一个取值函数，
    // 否则就直接使用开发者指定的计算属性函数
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    // 如果开发者指定的计算属性是函数，那么显然这个属性并没有设置set拦截函数
    sharedPropertyDefinition.set = noop
  // 如果计算属性是一个对象
  } else {
    // 如果计算属性对象的get函数存在，并且不是服务端渲染，并且开发者没有指定不缓存计算属性值，
    // 那么就通过createComputedGetter函数生成取值函数
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    // 如果计算属性对象指定了set函数
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  // 如果计算属是一个对象，但是只指定了get函数，而没有指定set函数时，
  // 在非生产环境下，会重新设置计算属性的set函数，
  // 并且这个set函数的函数体为一个警告，
  // 此时如果给这个计算属性赋值，就会打印这段警告
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  // defineComputed函数的核心代码，就是通过defineProperty，
  // 为vue实例设置这个计算属性，
  // 而这个defineComputed函数，函数体的主要工作就是在完善计算属性的配置对象——sharedPropertyDefinition
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 计算属性取值函数生成器
function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  // 这里遍历定义在watch上的所有属性
  for (const key in watch) {
    const handler = watch[key]
    // 判断属性值是否是数组
    // 从这里可以看出，watch不仅可以定义回调函数，还可以定义由回调函数组成的数组
    // 这就代表可以为某一个实例属性定义多个观察者
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  // 这一段if代码块的作用是，如果handler属性不是一个回调函数，而是一个字符串时，
  // 这就表示回调函数定义在了组件实例上面，而这个字符串表示的就是这个回调函数的名称
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 初始话工具方法$watch
  // 注意这里的第二个参数，cb既可以是函数，也可以是一个纯对象，如果是纯对象，那么这个对象上需要有handler属性，
  // 那么这个handler属性就会被作为回调函数
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this

    // 第二个参数可以是一个对象，可以替代回调函数，
    // 如果第二参数是一个对象，就需要在这个对象上定义一个handler属性，这个handler属性就会被作为回调函数，
    // 此外其他配置项，比如immediate和deep也都可以定义在这个对象上
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true // 表示这个watcher是用户创建的
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 如果选项参数的immediate为true，表示实例属性被监听后立即执行回调，
    // watcher创建以后，会对表达式求值，并将求到的值赋值给watcher的value属性
    if (options.immediate) {
      cb.call(vm, watcher.value)
    }
    // 最终返回一个函数，这个函数用于解除对指定属性的观察
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}

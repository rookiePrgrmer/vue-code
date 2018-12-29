/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  // 通知变化
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      // 这行代码的作用是，在同步执行观察者的时候，保证观察者能够按照创建顺序执行
      // 那么什么时候需要同步执行观察者呢？在使用vue-test-utils时，为了方便调试，会把全局的async(/src/core/config.js)设置为false，
      // 也就上面的config.async，
      // 那么在执行观察者的update方法时，即使是异步更新，其实也会对观察者进行排序，因此这里由于不再通过统一的异步方式更新，
      // 因此也要进行排序
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// the current target watcher being evaluated.
// this is globally unique because there could be only one
// watcher being evaluated at any time.
// 用于指向当前正在求值的观察者
Dep.target = null
// 观察者堆，按照依赖关系，由外到内
const targetStack = []

// Dep.target保存着一个观察者对象
// target属性的作用是，目前看来，就是想找一个全局的位置，用来保存当前正在操作的watcher,
// 然后在watcher的构造函数中，调用属性的get函数，用来触发依赖（Dep）收集，
// 然后把属性的依赖（Dep）添加到watcher中，
// 与此同时，依赖（Dep）也把watcher添加到自己的subs数组中，
// 因此这里Dep和Watcher两者是互相依赖的
export function pushTarget (_target: ?Watcher) {
  if (Dep.target) targetStack.push(Dep.target)
  Dep.target = _target
}

export function popTarget () {
  Dep.target = targetStack.pop()
}

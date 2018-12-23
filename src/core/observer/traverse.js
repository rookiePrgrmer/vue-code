/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  // 判断val是否适合深度观测
  // 首先val必须是数组或者对象
  // 其次val不能是frozen状态，否则无法为其属性设置get/set拦截器
  // 最后val不能是vnode
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  /*
  * 下面这段代码的作用是，防止在遍历过程中，
  * 由于循环引用的存在，导致无限循环
  * 主要的原理就是通过一个Set保存，已经遍历过的对象类型属性的依赖的id，
  * 如果再Set中已经存在的了某个id，就表示这个属性已经被遍历过一次了，因此直接返回
  */
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }

  /*
  * 下面这部分代码的作用看似只是遍历了val上的属性，
  * 但是关键在于val[i]和val[keys[i]]，这两个代码，
  * 它们的作用就是触发属性的get拦截器函数，进而收集到对应属性的观察者
  */
  // 如果是数组
  if (isA) {
    i = val.length
    // 这里val[i]就是触发子属性的get拦截器，进而收集到这个属性的观察者
    while (i--) _traverse(val[i], seen)
  // 如果是对象s
  } else {
    keys = Object.keys(val)
    i = keys.length
    // 同样val[keys[i]]也是用于触发子属性的get拦截器，鸡儿收集到这个属性的观察者
    while (i--) _traverse(val[keys[i]], seen)
  }
}

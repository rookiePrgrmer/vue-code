/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
export function createElement (
  context: Component, // vm实例
  tag: any, // 标签名称
  data: any, // 用于渲染页面的数据
  children: any, // 子节点
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  // 首先判断data是否是数组，或者是否是基本数据类型
  // 如果满足这两个条件之一，这就表示这个data实际是第4个参数children，
  // 下面的操作就是把入参赋值给正确的变量s
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  // 判断是否对children进行规范化
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }

  // 以上对参数进行处理以后，真正调用的是这个方法
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData, // 用于渲染页面的数据
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // 判断VNodeData是否是响应式的，如果是响应式的则给出错误提示
  // 这里判断条件是，如果对象上定义了__ob__的属性，就表示这个对象是响应式的
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )

    // 这里创建了一个空的VNode节点
    return createEmptyVNode()
  }
  // object syntax in v-bind
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }

  /* 以下逻辑非常重要 */
  // 对children进行normalize，也即是规范化
  // 合理的规范化，主要的目的就是把从外部传入的children参数，
  // 转换为一维的VNode数组
  // 这就是createElement函数，做的第一个事情
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    children = simpleNormalizeChildren(children)
  }

  /* 以下逻辑非常重要 */
  // createElement做的第二个比较重要事情，就是创建VNodes
  let vnode, ns
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 如果tag是平台（浏览器）内置的标签，比如div
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      // 这里创建出来的vnode，就是createElement最终的返回值
      vnode = new VNode(
        // 其实parsePlatformTagName仅仅是返回了入参
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}

/* @flow */

import VNode, { createTextVNode } from 'core/vdom/vnode'
import { isFalse, isTrue, isDef, isUndef, isPrimitive } from 'shared/util'

// The template compiler attempts to minimize the need for normalization by
// statically analyzing the template at compile time.
// 模板编译器，在编译时通过对模板的静态分析，会尽可能降低规范化的必要性
//
// For plain HTML markup, normalization can be completely skipped because the
// generated render function is guaranteed to return Array<VNode>. There are
// two cases where extra normalization is needed:
// 对于普通的HTML标签来说，规范化可以完全跳过，因为生成的render函数能够保证一定会返回一个Array<VNode>。
// 因此，这里仅有两种情况，需要额外的规范化：

// 1. When the children contains components - because a functional component
// may return an Array instead of a single root. In this case, just a simple
// normalization is needed - if any child is an Array, we flatten the whole
// thing with Array.prototype.concat. It is guaranteed to be only 1-level deep
// because functional components already normalize their own children.
// 第一种情况，当子元素中包含有组件时——因为函数式组件可能会返回一个数组，而不是唯一的根元素。
// 在这种情况下，简单的规范化操作还是必要的——如果任何一个子元素是数组，那么就会用Array.prototype.concat将其打平。
// 这里仅仅保证进行一层打平操作，因为函数式组件已经对他们的子元素进行了规范化操作。
export function simpleNormalizeChildren (children: any) {
  for (let i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      // 注意，这里用了apply方法，此时如果第二个参数是个数组，
      // 那么就会把，这个数组中的所有元素作为模板函数的参数传入，
      // 因此能够达到打平数组的目的
      return Array.prototype.concat.apply([], children)
    }
  }
  return children
}

// 2. When the children contains constructs that always generated nested Arrays,
// e.g. <template>, <slot>, v-for, or when the children is provided by user
// with hand-written render functions / JSX. In such cases a full normalization
// is needed to cater to all possible types of children values.
// 第二种情况。如果子元素中包含总是生成前套数组的结构，比如<template>、<slot>、v-for，
// 或者，子元素是由用户手写的render函数/JSX提供。
// 那么在这种情况下，就需要完整的规范化操作来处理所有类型的子元素。
export function normalizeChildren (children: any): ?Array<VNode> {
  return isPrimitive(children)
    ? [createTextVNode(children)]
    : Array.isArray(children)
      ? normalizeArrayChildren(children)
      : undefined
}

function isTextNode (node): boolean {
  return isDef(node) && isDef(node.text) && isFalse(node.isComment)
}

// 完全规范化
// 完全规范化和简单规范化的区别有2：
// 1、完全规范化会递归地处理所有的子元素
// 2、对文本节点进行了合并优化
function normalizeArrayChildren (children: any, nestedIndex?: string): Array<VNode> {
  const res = []
  let i, c, lastIndex, last
  for (i = 0; i < children.length; i++) {
    c = children[i]
    if (isUndef(c) || typeof c === 'boolean') continue
    lastIndex = res.length - 1
    last = res[lastIndex]
    //  nested
    if (Array.isArray(c)) {
      if (c.length > 0) {
        c = normalizeArrayChildren(c, `${nestedIndex || ''}_${i}`)
        // merge adjacent text nodes
        // 优化：如果上一个元素和当前元素（数组）的第一个元素均是文本元素，
        // 那么就把这两个文本合并为一个元素，并保存到上一个元素中，
        // 然后删除当前元素的第一个元素
        if (isTextNode(c[0]) && isTextNode(last)) {
          res[lastIndex] = createTextVNode(last.text + (c[0]: any).text)
          c.shift()
        }
        res.push.apply(res, c) // 嵌套数组打平的核心操作
      }
    } else if (isPrimitive(c)) {
      if (isTextNode(last)) {
        // merge adjacent text nodes
        // this is necessary for SSR hydration because text nodes are
        // essentially merged when rendered to HTML strings
        // 同样用于字符串合并
        // 这里注释给出的原因是：在使用了SSR的场景下，文本节点本来就会在渲染为HTML页面时被合并掉
        res[lastIndex] = createTextVNode(last.text + c)
      } else if (c !== '') {
        // convert primitive to vnode
        // 如果当前元素是非文本节点的基础数据类型，
        // 那么就将其转换为文本节点
        res.push(createTextVNode(c))
      }
    } else {
      if (isTextNode(c) && isTextNode(last)) {
        // merge adjacent text nodes
        res[lastIndex] = createTextVNode(last.text + c.text)
      } else {
        // default key for nested array children (likely generated by v-for)
        if (isTrue(children._isVList) &&
          isDef(c.tag) &&
          isUndef(c.key) &&
          isDef(nestedIndex)) {
          c.key = `__vlist${nestedIndex}_${i}__`
        }
        res.push(c)
      }
    }
  }
  return res
}

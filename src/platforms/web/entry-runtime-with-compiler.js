/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// Vue 实例挂载，实现页面渲染
// 这里可以看到， Vue 的原型上本身就有一个 $mount ，然后下面又重写了这个方法
// 而原始的 $mount 方法位于 runtime/index
// 而之所以有两个版本的 $mount，原因是 Vue 又分为 runtime 和 runtime + compiler 两个版本
// 也就是说，原始版本的 $mount 是专门用于 runtime 版本的 Vue 的，
// 并且还可以在 runtime + compiler 版本中对这部分逻辑进行服用
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element, // 表示挂载点对应的标签元素
  hydrating?: boolean
): Component {
  el = el && query(el) // 首先在dom中找到这个元素对象

  /* istanbul ignore if */
  // 这里进行了判断：Vue不能直接挂载到body或者html上
  // 原因是，Vue会对挂载点进行替换，那么从外部传进来的这个标签会消失，那么整个html文档格式就不正确了
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 如果vm实例上没有render方法
  if (!options.render) {
    let template = options.template
    // 如果vm实例上定义了template属性
    if (template) {
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    // 如果vm实例上没有定义template属性，则获取指定标签元素的outerHTML
    } else if (el) {
      template = getOuterHTML(el)
    }

    // 如果能成功获取到template字符串，
    // 则把template转换为render函数，也就是"编译"相关逻辑
    /*
      由此可知，Vue中无论是那种方式写的模板，
      包括template属性、template标签，还是直接提供render函数，
      最终都会转换为render函数
    */
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
// 获取指定标签，包括这个标签本身在内的，及其子元素的html内容字符串
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  // 若干浏览器不支持outerHTML属性，
  // 则构建一个div标签，
  // 并将指定元素嵌入这个div中，
  // 最终返回这个div的innerHTML属性值
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue

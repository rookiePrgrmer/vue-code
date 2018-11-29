/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.

  // 暴露的工具方法.
  // 注意：这些工具方法并非是公共API的一部分，除非你意识到了风险，否则不要依赖它们
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  Vue.options = Object.create(null)
  // 注册全局Vue属性对象，包括components、directives、filters
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  // 注册内置组件，这里builtInComponents里面只有一个keep-alive
  extend(Vue.options.components, builtInComponents)

  // 在import 'vue'的时候，初始化这些全局方法，才能在运行时，使用这些方法
  initUse(Vue) // 定义全局的Vue.use方法，也就是用于注册插件的用的
  initMixin(Vue) // 定义全局的Vue.mixin方法
  initExtend(Vue) // 定义全局的Vue.extend方法
  initAssetRegisters(Vue) // 定义全局资源方法，比如Vue.component、Vue.directive、Vue.filter等方法
}

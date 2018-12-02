/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (process.env.NODE_ENV !== 'production') {
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  )

  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  // 判断当前环境是否支持Proxy的API，这是es6提供的
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  // proxy的handler对象，这里代理has操作，也就是判断指定属性是否存在于目标对象中
  // has方法接受两个参数，分别是目标对象和目标属性名
  // 这个代理的主要作用是，监听模板中是否使用了未定义的实例变量
  const hasHandler = {
    has (target, key) {
      // 这里判断指定属性是否存在
      const has = key in target
      // 这里判断这个属性是否是全局属性，或者是一个string类型的，以"_"开头的data下的私有属性
      const isAllowed = allowedGlobals(key) ||
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))
      // 如果以上条件均不满足
      if (!has && !isAllowed) {
        if (key in target.$data) warnReservedPrefix(target, key)
        // 则会给出警告，提示模板中使用的变量，一定要在实例中声明
        else warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  // 处理_renderProxy的函数
  initProxy = function initProxy (vm) {
    // 如果环境支持Proxy的API
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      // 由于在 runtime + compiler 的环境下，没有设置_withStripped因此，这里handlers就是hasHandler
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

export { initProxy }

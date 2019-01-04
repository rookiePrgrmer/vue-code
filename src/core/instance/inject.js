/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

export function initInjections (vm: Component) {
  // 获取当前组件声明的需要注入的数据
  const result = resolveInject(vm.$options.inject, vm)
  // 如果能够成功搜索到这些数据，就利用defineReactive，将这些数据定义到当前组件实例上
  // 注意到在定义数据之前，会关闭响应式开关，因为 provide/inject 注入的数据是不具有响应式功能的
  if (result) {
    toggleObserving(false)
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      // 在非生产环境下，如果尝试覆盖 inject 数据，就会给出错误提示
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true)
  }
}

export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    // keys 包含 inject 中的属性名
    // 这里 hasSymbol 用于判断，当前运行环境是否原生支持 Symbol 和 Reflect
    // 如果原生支持 Symbol 和 Reflect ，那么 keys 中包含目标对象中所有可遍历的属性，包括 Symbol
    // 如果原生不支持 Symbol 和 Reflect，那么 keys 中就不包括 Symbol
    const keys = hasSymbol
      ? Reflect.ownKeys(inject).filter(key => {
        /* istanbul ignore next */
        return Object.getOwnPropertyDescriptor(inject, key).enumerable
      })
      : Object.keys(inject)

    // 遍历所有子组件声明需要依赖的键
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] // 子组件声明需要注入的数据的键
      const provideKey = inject[key].from // 由父组件提供的数据的键
      let source = vm // 当前子组件实例
      // 这个循环的作用是，从当前子组件开始，向父级搜索是否有 _provide 属性，并搜索在父组件的 _provide 中是否包含指定的键
      // 这里有个情况是，这个循环是从当前组件开始搜索的，那么如果当前组件本身就有 provide 那么有可能会把当前组件提供的数据，注入个自己吗？
      // 答案是否定的。因为对 inject 的初始化是在 provide 之前的，即使当前组件有 provide ，但由于还未初始化，因此也拿不到数据
      while (source) {
        // 如果在父组件中找到了指定的 inject 键，那么就将对应的值保存到 result 中
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }

      // 执行到了这里时，表示即使搜索到了根组件也没有找到指定的数据
      if (!source) {
        // 此时先尝试看看指定的数据上有没有定义默认值
        if ('default' in inject[key]) {
          // 如果有默认值，那么就把这个默认值作为最终注入的数据
          const provideDefault = inject[key].default
          // 如果默认值是函数，则使用其返回值，否则就以本身作为注入的数据
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        // 如果连默认值都没有提供，则给出错误提示
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}

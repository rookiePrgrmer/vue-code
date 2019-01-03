/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key]
  const absent = !hasOwn(propsData, key)
  let value = propsData[key]
  // boolean casting
  // 首先判断当前prop属性的类型中是否包含 Boolean 类型，或者prop属性的类型就是 Boolean 类型
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // 大于-1表示类型包含 Boolean 类型，或者就是 Boolean 类型
  if (booleanIndex > -1) {
    // 开发者没有传递这个prop属性，并且这个prop在定义时，没有设置默认值
    if (absent && !hasOwn(prop, 'default')) {
      // 此时将这个prop属性值设置为false
      value = false
    // 如果开发者传递了这个prop属性，
    // 但是属性值为空字符串，或者值是与属性名相同，但是是通过连字符连接起来的小写形式
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 判断该prop的配置项中是否定义了String类型
      const stringIndex = getTypeIndex(String, prop.type)
      // 如果没有定义String类型，或者定义了String类型，但是String类型的优先级没有Boolean高
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }

  /**
   * 从上面代码可知：
   * 1、props属性配置项中的类型可以是个数组
   * 2、在类型数组中，具有优先级的概念，在数组中靠前的类型优先级更高
   * */

  // check default value
  // 判断开发者传递的prop属性值是否是undefined
  if (value === undefined) {
    // 如果是undefined则通过getPropDefaultValue或者预设的默认值
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 如果获取了默认值，那么重新打开响应式开关，因为默认值还不是响应式的，
    // 然后令该变量响应化以后，再关闭开关
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  // 如果该prop没有预设默认值，则直接返回undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 如果 prop 属性是 Array 或者 Object ，那么它的默认值必须是工厂函数，再由工厂函数返回默认值，
  // 这样做的原因是，当应用中创建了若干组件实例时，如果默认值是对象或数组，
  // 那么由某个组件实例对默认值进行了修改，也会影响到其他组件实例
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger

  /**
   * 这里解释下下面if条件的后2项
   * 第一项：初始化的时候，在调用 getPropDefaultValue 之前已经判断过一次value是否为undefined了，这里再次判断显得多余，
   * 但是实际上这里的判断是为子组件更新时准备的，
   * 因为在lifecycle中updateChildComponent时，也会调用validateProp，但在调用这个方法时传递的propsData，
   * 是待更新的新props数据，而 vm.$options.propsData 还是还是上次渲染时的props数据，
   * 因此两者在更新子组件时，值可能是有差异的
   * 第二项：初始化的时候，vm._props[key] !== undefined 一定是 false，因为在initProps中给props设置响应式数据，
   * 是在validateProp之后，因此此时vm._props[key]一定是undefined，
   * 所以显然这里进行这个判断的作用是用于后续更新子组件，而不是初始化组件时。
   * 那么这里 vm._props[key] !== undefined 表示当前key对应的prop属性不包含未定义的默认值
   */

  /**
   * 翻译这个if条件的就是如下含义：
   * 1、当前组件处于更新状态，且没有传递该 prop 数据给组件
   * 2、上一次更新或创建时外界也没有向组件传递该 prop 数据
   * 3、上一次组件更新或创建时该 prop 拥有一个不为 undefined 的默认值。
   * 这里之所以是默认值是因为，上述第2条表示上次已经没有传递prop了，因此这里 _props 中一定是默认值
   */

  // 那么此时应该返回之前的 prop 值(即默认值)作为本次渲染该 prop 的默认值
  // 这样做的好处是：避免触发无意义的响应。
  // 原因是当 prop 的类型为 Array 或者 Object 时，必须通过工厂函数返回，
  // 而每次调用工厂函数都会返回一个新的值，一旦引用发生改变就会触发响应，但其实作为默认值这样毫无意义
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 如果上次传递了 props 属性值，或者该 prop 的默认值为 undefined，
  // 此时，就要重新获取默认值。
  // 这里需要注意的是，如果默认值是函数，并且这个 prop 的类型不是函数类型，此时就要调用默认值工厂函数，
  // 如果 prop 的类型就是函数类型，那么就要直接返回默认值
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || type === true
  const expectedTypes = []
  if (type) {
    if (!Array.isArray(type)) {
      type = [type]
    }
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  if (!valid) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
// 由于在不同的 iframe 环境下，同一种数据类型变量的类型构造函数不同，
// 因此直接通过 typeof 或者 instanceof 判断类型会失败，
// 因此通过正则匹配构造函数的函数体字符串
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable (value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}

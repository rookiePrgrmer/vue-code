/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
// platformModules中定义了很多常用的指令模块，比如:class、:style，还有属性指令，比如:href等等
// 那么Vue在渲染页面时，动态地想dom中添加的属性，就是这些指令模块完成
const modules = platformModules.concat(baseModules)

// nodeOps中包含的都是具体的dom操作函数，比如createElement等
// 其实这里利用了函数柯里化的方法，向patch方法中预设了若干参数，
// 而这里预设的参数，就是用于动态地（运行时）改变vm.__patch__函数的执行逻辑
// 因为Vue目前可以跨端运行，既可以运行在web端，也可以运行在Weex端，
// 在不同的平台中，操作真实"dom"的api是不同的，而操作vdom的api是公共的，
// 因此不同的模块，或者指令在不同的生命周期中所要执行的操作也是不同的，
// 所以modules也分为了baseModules和platformModules，
// 分别指代公共生命周期逻辑，和平台相关生命周期逻辑。

// 反过来，如果不用函数柯里化的方法，那么势必要在patch函数中编写大量的if/else代码，
// 用于在不同的平台中执行不同的操作，而一点设计的模块比较多的时候，
// 类似的if/else将会非常多，这非常不利于代码的维护
export const patch: Function = createPatchFunction({ nodeOps, modules })

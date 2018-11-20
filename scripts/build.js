const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const rollup = require('rollup')
const terser = require('terser')

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist')
}

// 这一步生成所有的构建配置
let builds = require('./config').getAllBuilds()

// filter builds via command line arg
// 这里process.argv[2]，表示命令行中输入的参数
if (process.argv[2]) {
  const filters = process.argv[2].split(',')
  // 只构建指定的文件，其他文件一律过滤掉
  builds = builds.filter(b => {
    return filters.some(f => b.output.file.indexOf(f) > -1 || b._name.indexOf(f) > -1)
  })
// 如果命令行中没有指定任何参数，则执行默认构建，也就是构建除去weex以外的所有文件
} else {
  // filter out weex builds by default
  builds = builds.filter(b => {
    return b.output.file.indexOf('weex') === -1
  })
}

build(builds)

// 构建主函数
// 遍历所有构建配置对象，依次执行buildEntry方法
function build (builds) {
  let built = 0
  const total = builds.length
  const next = () => {
    buildEntry(builds[built]).then(() => {
      built++
      if (built < total) {
        next()
      }
    }).catch(logError)
  }

  next()
}

// 具体的构建逻辑
// config就是config.js中指定的一个个配置对象
function buildEntry (config) {
  const output = config.output
  const { file, banner } = output
  const isProd = /min\.js$/.test(file)
  // 这里可以看到使用rollup，并通过构建配置进行构建
  return rollup.rollup(config)
    .then(bundle => bundle.generate(output))
    .then(({ code }) => {
      // 文件后缀带有"min.js"字样则表示线上环境，因此需要压缩和混淆
      if (isProd) {
        const minified = (banner ? banner + '\n' : '') + terser.minify(code, {
          output: {
            ascii_only: true
          },
          compress: {
            pure_funcs: ['makeMap']
          }
        }).code
        return write(file, minified, true)
      } else {
        return write(file, code)
      }
    })
}

function write (dest, code, zip) {
  return new Promise((resolve, reject) => {
    function report (extra) {
      console.log(blue(path.relative(process.cwd(), dest)) + ' ' + getSize(code) + (extra || ''))
      resolve()
    }

    // 文件的生成是通过fs.writeFile方法，指定文件生成路径，和代码内容而生成
    fs.writeFile(dest, code, err => {
      if (err) return reject(err)
      if (zip) {
        zlib.gzip(code, (err, zipped) => {
          if (err) return reject(err)
          report(' (gzipped: ' + getSize(zipped) + ')')
        })
      } else {
        report()
      }
    })
  })
}

function getSize (code) {
  return (code.length / 1024).toFixed(2) + 'kb'
}

function logError (e) {
  console.log(e)
}

function blue (str) {
  return '\x1b[1m\x1b[34m' + str + '\x1b[39m\x1b[22m'
}

import { ESLintUtils } from '@typescript-eslint/utils'

import path from 'path'
import { createRule } from '../utils/createRule'
import { getLintingFilePath } from '../utils/path'

type MappingPathMap = {
  [absoluteSrcPath: string]: {
    distPath: string
    prefixed: boolean
  }
}

type Options = []
type MessageIds = 'hasTsPathsImport'

export default createRule<Options, MessageIds>({
  name: 'prefer-ts-paths-imports',
  meta: {
    docs: {
      description: 'Disallow replaceable imports defined in paths of tsconfig.json',
      recommended: 'error',
      suggestion: true,
    },
    fixable: 'code',
    type: 'suggestion',
    schema: [],
    messages: {
      hasTsPathsImport: `has replaceable import '{{filePath}}'`,
    },
  },
  defaultOptions: [],
  create(context) {
    const { program } = ESLintUtils.getParserServices(context)

    const compilerOptions = program.getCompilerOptions()
    const currentDirectory = program.getCurrentDirectory()

    const { paths = {}, baseUrl = currentDirectory } = compilerOptions

    // Get replace path map for replacing from absolute path to short path
    const pathMap: MappingPathMap = {}

    Object.keys(paths).forEach((distPath) => {
      paths[distPath].forEach((srcPath) => {
        const absoluteSrcPath = path.resolve(baseUrl, srcPath)
        const isPrefixed = absoluteSrcPath.endsWith('/*') && distPath.endsWith('/*')
        if (isPrefixed) {
          // Applies to all files in that folder
          const newSrcPath = absoluteSrcPath.slice(0, absoluteSrcPath.length - 1)
          const newDistPath = distPath.slice(0, distPath.length - 1)

          pathMap[newSrcPath] = { distPath: newDistPath, prefixed: true }
        } else {
          // Apply only this file
          pathMap[absoluteSrcPath] = { distPath, prefixed: false }
        }
      })
    })

    const getFixedFilePath = (relativeTargetFilePath: string): string => {
      const lintingFilePath = getLintingFilePath(context)
      const lintingFolderPath = path.dirname(lintingFilePath)

      const absoluteTargetFilePath = path.resolve(lintingFolderPath, relativeTargetFilePath)

      for (const absoluteSrcFilePath of Object.keys(pathMap)) {
        const { distPath, prefixed } = pathMap[absoluteSrcFilePath]

        // Ignore case between two files
        if (prefixed) {
          if (absoluteTargetFilePath.toLowerCase().startsWith(absoluteSrcFilePath.toLocaleLowerCase())) {
            return path.join(distPath, absoluteTargetFilePath.slice(absoluteSrcFilePath.length))
          }
        } else {
          if (absoluteTargetFilePath.toLowerCase() === absoluteSrcFilePath.toLowerCase()) {
            return distPath
          }
        }
      }

      return null
    }

    return {
      ImportDeclaration(node): void {
        const { source } = node

        const matchResult = /^(["'])(.*)(\1)$/g.exec(source?.raw?.trim() || '')
        if (!matchResult) {
          return
        }

        const [_, quote, importPath] = matchResult
        const fixedFilePath = getFixedFilePath(importPath)

        if (!!fixedFilePath && fixedFilePath !== importPath) {
          context.report({
            node,
            data: { filePath: fixedFilePath },
            messageId: 'hasTsPathsImport',
            fix(fixer) {
              return fixer.replaceText(source, `${quote}${fixedFilePath}${quote}`)
            },
          })
        }
      },
    }
  },
})

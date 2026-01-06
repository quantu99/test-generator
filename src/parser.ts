import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { FunctionInfo, ParamInfo, TypeInfo } from './types';
import { TypeResolver } from './type-resolver';

let typeResolver: TypeResolver | null = null;

export class ParseError extends Error {
  constructor(
    message: string,
    public filePath: string,
    public line?: number,
    public column?: number
  ) {
    super(message);
    this.name = 'ParseError';
    Error.captureStackTrace(this, ParseError);
  }
}

export function parseFile(filePath: string): FunctionInfo[] {
  // Validate file path
  if (!filePath || typeof filePath !== 'string') {
    throw new ParseError('Invalid file path provided', filePath || 'unknown');
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new ParseError(`File not found: ${filePath}`, filePath);
  }

  // Check if it's a file (not directory)
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new ParseError(`Path is not a file: ${filePath}`, filePath);
  }

  let sourceCode: string;
  try {
    sourceCode = fs.readFileSync(filePath, 'utf-8');
  } catch (error: any) {
    throw new ParseError(
      `Failed to read file: ${error.message}`,
      filePath
    );
  }

  // Validate file is not empty
  if (!sourceCode.trim()) {
    return [];
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );
  } catch (error: any) {
    throw new ParseError(
      `Failed to parse TypeScript source: ${error.message}`,
      filePath
    );
  }

  // Check for syntax errors
  const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram([filePath], {})
  );
  const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const errorMessages = errors
      .map(e => {
        const message = ts.flattenDiagnosticMessageText(e.messageText, '\n');
        if (e.file && e.start !== undefined) {
          const { line, character } = e.file.getLineAndCharacterOfPosition(e.start);
          return `Line ${line + 1}, Column ${character + 1}: ${message}`;
        }
        return message;
      })
      .join('\n');
    
    throw new ParseError(
      `TypeScript syntax errors found:\n${errorMessages}`,
      filePath
    );
  }

  // Initialize type resolver
  try {
    const projectRoot = findProjectRoot(filePath);
    typeResolver = new TypeResolver(projectRoot);
  } catch (error: any) {
    // Type resolution is optional, continue without it
    typeResolver = null;
  }

  const functions: FunctionInfo[] = [];

  function visit(node: ts.Node, className?: string) {
    // 1. Function declarations
    if (ts.isFunctionDeclaration(node)) {
      const func = extractFunctionInfo(node, 'function', className, sourceFile);
      if (func) functions.push(func);
    }
    
    // 2. Arrow functions as const/let/var
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach(decl => {
        if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
          const func = extractArrowFunctionInfo(decl, node, sourceFile);
          if (func) functions.push(func);
        }
        // Function expression: const foo = function() {}
        if (decl.initializer && ts.isFunctionExpression(decl.initializer)) {
          const func = extractFunctionExpressionInfo(decl, node, sourceFile);
          if (func) functions.push(func);
        }
      });
    }

    // 3. Object methods: const obj = { method() {} }
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach(decl => {
        if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          const objName = decl.name.getText();
          decl.initializer.properties.forEach(prop => {
            if (ts.isMethodDeclaration(prop) || ts.isPropertyAssignment(prop)) {
              const func = extractObjectMethodInfo(prop, objName, node, sourceFile);
              if (func) functions.push(func);
            }
          });
        }
      });
    }

    // 4. Class methods (including private/protected, static, getter/setter)
    if (ts.isClassDeclaration(node)) {
      const currentClassName = node.name?.getText() || 'Anonymous';
      node.members.forEach(member => {
        if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
          const func = extractMethodInfo(member, currentClassName, sourceFile);
          if (func) functions.push(func);
        } else if (ts.isGetAccessorDeclaration(member)) {
          const func = extractGetterInfo(member, currentClassName, sourceFile);
          if (func) functions.push(func);
        } else if (ts.isSetAccessorDeclaration(member)) {
          const func = extractSetterInfo(member, currentClassName, sourceFile);
          if (func) functions.push(func);
        }
      });
    }

    // 5. Export default function
    if (ts.isExportAssignment(node)) {
      if (ts.isFunctionExpression(node.expression)) {
        const func = extractDefaultExportFunction(node.expression, sourceFile);
        if (func) functions.push(func);
      } else if (ts.isArrowFunction(node.expression)) {
        const func = extractDefaultExportArrowFunction(node.expression, sourceFile);
        if (func) functions.push(func);
      }
    }

    ts.forEachChild(node, (child) => visit(child, className));
  }

  visit(sourceFile);
  return functions;
}

function findProjectRoot(filePath: string): string {
  try {
    let currentDir = path.dirname(path.resolve(filePath));
    const root = path.parse(currentDir).root;
    
    while (currentDir !== root) {
      const packageJson = path.join(currentDir, 'package.json');
      try {
        if (fs.existsSync(packageJson)) {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
      currentDir = path.dirname(currentDir);
    }
  } catch (error: any) {
    // Fallback to current working directory
  }
  
  return process.cwd();
}

function extractFunctionInfo(
  node: ts.FunctionDeclaration,
  kind: 'function' | 'method',
  className: string | undefined,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText();
  if (!name) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = extractTypeInfo(node.type, sourceFile);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
  const isExported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
  const isDefaultExport = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport,
    kind,
    className,
    decorators,
    jsdoc,
  };
}

function extractArrowFunctionInfo(
  decl: ts.VariableDeclaration,
  statement: ts.VariableStatement,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = decl.name.getText();
  const arrowFunc = decl.initializer as ts.ArrowFunction;

  const params = extractParams(arrowFunc.parameters, sourceFile);
  const returnType = extractTypeInfo(arrowFunc.type, sourceFile);
  const isAsync = hasModifier(arrowFunc, ts.SyntaxKind.AsyncKeyword);
  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const jsdoc = extractJSDoc(statement);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport: false,
    kind: 'arrow',
    jsdoc,
  };
}

function extractFunctionExpressionInfo(
  decl: ts.VariableDeclaration,
  statement: ts.VariableStatement,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = decl.name.getText();
  const funcExpr = decl.initializer as ts.FunctionExpression;

  const params = extractParams(funcExpr.parameters, sourceFile);
  const returnType = extractTypeInfo(funcExpr.type, sourceFile);
  const isAsync = hasModifier(funcExpr, ts.SyntaxKind.AsyncKeyword);
  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const jsdoc = extractJSDoc(statement);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport: false,
    kind: 'function',
    jsdoc,
  };
}

function extractObjectMethodInfo(
  prop: ts.MethodDeclaration | ts.PropertyAssignment,
  objName: string,
  statement: ts.VariableStatement,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  let name: string;
  let params: ParamInfo[];
  let returnType: TypeInfo;
  let isAsync = false;

  if (ts.isMethodDeclaration(prop)) {
    name = prop.name?.getText() || '';
    params = extractParams(prop.parameters, sourceFile);
    returnType = extractTypeInfo(prop.type, sourceFile);
    isAsync = hasModifier(prop, ts.SyntaxKind.AsyncKeyword);
  } else if (ts.isPropertyAssignment(prop)) {
    name = prop.name?.getText() || '';
    if (ts.isArrowFunction(prop.initializer)) {
      const arrowFunc = prop.initializer;
      params = extractParams(arrowFunc.parameters, sourceFile);
      returnType = extractTypeInfo(arrowFunc.type, sourceFile);
      isAsync = hasModifier(arrowFunc, ts.SyntaxKind.AsyncKeyword);
    } else if (ts.isFunctionExpression(prop.initializer)) {
      const funcExpr = prop.initializer;
      params = extractParams(funcExpr.parameters, sourceFile);
      returnType = extractTypeInfo(funcExpr.type, sourceFile);
      isAsync = hasModifier(funcExpr, ts.SyntaxKind.AsyncKeyword);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!name) return null;

  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);

  return {
    name: `${objName}.${name}`,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport: false,
    kind: 'method',
    className: objName,
  };
}

function extractMethodInfo(
  node: ts.MethodDeclaration | ts.ConstructorDeclaration,
  className: string,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = ts.isConstructorDeclaration(node) 
    ? 'constructor' 
    : node.name?.getText() || '';
  
  if (!name) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = ts.isConstructorDeclaration(node) 
    ? { raw: className, isUnion: false, isGeneric: false, isIntersection: false, baseType: className }
    : extractTypeInfo(node.type, sourceFile);
  
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
  const accessModifier = getAccessModifier(node);
  const isStatic = hasModifier(node, ts.SyntaxKind.StaticKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported: true,
    isDefaultExport: false,
    kind: isStatic ? 'static' : (ts.isConstructorDeclaration(node) ? 'constructor' : 'method'),
    accessModifier,
    className,
    isStatic,
    decorators,
    jsdoc,
  };
}

function extractGetterInfo(
  node: ts.GetAccessorDeclaration,
  className: string,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText() || '';
  if (!name) return null;

  const returnType = extractTypeInfo(node.type, sourceFile);
  const accessModifier = getAccessModifier(node);
  const isStatic = hasModifier(node, ts.SyntaxKind.StaticKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params: [],
    returnType,
    isAsync: false,
    isExported: true,
    isDefaultExport: false,
    kind: isStatic ? 'static' : 'getter',
    accessModifier,
    className,
    isStatic,
    decorators,
    jsdoc,
  };
}

function extractSetterInfo(
  node: ts.SetAccessorDeclaration,
  className: string,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText() || '';
  if (!name) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = { raw: 'void', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'void' };
  const accessModifier = getAccessModifier(node);
  const isStatic = hasModifier(node, ts.SyntaxKind.StaticKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params,
    returnType,
    isAsync: false,
    isExported: true,
    isDefaultExport: false,
    kind: isStatic ? 'static' : 'setter',
    accessModifier,
    className,
    isStatic,
    decorators,
    jsdoc,
  };
}

function extractDefaultExportFunction(
  node: ts.FunctionExpression,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText() || 'default';
  const params = extractParams(node.parameters, sourceFile);
  const returnType = extractTypeInfo(node.type, sourceFile);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported: true,
    isDefaultExport: true,
    kind: 'function',
  };
}

function extractDefaultExportArrowFunction(
  node: ts.ArrowFunction,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = 'default';
  const params = extractParams(node.parameters, sourceFile);
  const returnType = extractTypeInfo(node.type, sourceFile);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported: true,
    isDefaultExport: true,
    kind: 'arrow',
  };
}

function extractParams(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile
): ParamInfo[] {
  return parameters.map(param => {
    const name = param.name.getText();
    const type = extractTypeInfo(param.type, sourceFile);
    const optional = !!param.questionToken;
    const defaultValue = param.initializer?.getText();
    
    // Check for destructuring
    const isDestructured = ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name);
    let destructuredProps: string[] | undefined;
    
    if (ts.isObjectBindingPattern(param.name)) {
      const bindingPattern = param.name as ts.ObjectBindingPattern;
      destructuredProps = bindingPattern.elements.map(el => {
        if (ts.isBindingElement(el)) {
          return el.name?.getText() || '';
        }
        return '';
      }).filter(Boolean);
    } else if (ts.isArrayBindingPattern(param.name)) {
      const bindingPattern = param.name as ts.ArrayBindingPattern;
      destructuredProps = bindingPattern.elements.map(el => {
        if (ts.isBindingElement(el)) {
          return el.name?.getText() || '';
        }
        return '';
      }).filter(Boolean);
    }

    // Check for rest parameters
    const isRest = !!param.dotDotDotToken;

    return {
      name,
      type,
      optional,
      defaultValue,
      isDestructured,
      destructuredProps,
      isRest,
    };
  });
}

function extractTypeInfo(typeNode: ts.TypeNode | undefined, sourceFile: ts.SourceFile): TypeInfo {
  if (!typeNode) {
    return { raw: 'any', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'any' };
  }

  // Use type resolver if available
  if (typeResolver) {
    try {
      return typeResolver.resolveType(typeNode, sourceFile);
    } catch {
      // Fallback to basic parsing
    }
  }

  const raw = typeNode.getText();
  
  // Check for union types
  if (ts.isUnionTypeNode(typeNode)) {
    const unionTypes = typeNode.types.map(t => t.getText());
    return {
      raw,
      isUnion: true,
      isGeneric: false,
      isIntersection: false,
      baseType: unionTypes[0],
      unionTypes,
    };
  }

  // Check for intersection types
  if (ts.isIntersectionTypeNode(typeNode)) {
    const intersectionTypes = typeNode.types.map(t => t.getText());
    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: true,
      baseType: intersectionTypes[0],
      intersectionTypes,
    };
  }

  // Check for tuple types
  if (ts.isTupleTypeNode(typeNode)) {
    const tupleTypes = typeNode.elements.map(t => extractTypeInfo(t, sourceFile));
    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: false,
      baseType: 'tuple',
      isTuple: true,
      tupleTypes,
    };
  }

  // Check for literal types
  if (ts.isLiteralTypeNode(typeNode)) {
    const literal = typeNode.literal;
    let value: string | number | boolean | undefined;
    
    if (ts.isStringLiteral(literal)) {
      value = literal.text;
    } else if (ts.isNumericLiteral(literal)) {
      value = parseFloat(literal.text);
    } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
      value = true;
    } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
      value = false;
    }

    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: false,
      baseType: typeof value,
      isLiteral: true,
      literalValue: value,
    };
  }

  // Check for generic types
  if (ts.isTypeReferenceNode(typeNode) && typeNode.typeArguments) {
    const baseType = typeNode.typeName.getText();
    const genericTypes = typeNode.typeArguments.map(t => t.getText());
    return {
      raw,
      isUnion: false,
      isGeneric: true,
      isIntersection: false,
      baseType,
      genericTypes,
    };
  }

  // Check for never type
  if (ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText() === 'never') {
    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: false,
      baseType: 'never',
      isNever: true,
    };
  }

  return {
    raw,
    isUnion: false,
    isGeneric: false,
    isIntersection: false,
    baseType: raw,
  };
}

function extractDecorators(node: ts.Node): string[] | undefined {
  if (!ts.canHaveDecorators(node)) {
    return undefined;
  }
  
  const decorators = ts.getDecorators(node);
  if (!decorators || decorators.length === 0) {
    return undefined;
  }

  return decorators.map(dec => dec.getText());
}

function extractJSDoc(node: ts.Node): string | undefined {
  const jsdoc = ts.getJSDocCommentsAndTags(node);
  if (jsdoc && jsdoc.length > 0) {
    return jsdoc.map(doc => doc.getText()).join('\n');
  }
  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  // Type assertion: nodes we check (FunctionDeclaration, VariableStatement, etc.) can have modifiers
  const modifiers = ts.getModifiers(node as ts.HasModifiers);
  return modifiers?.some(mod => mod.kind === kind) || false;
}

function getAccessModifier(node: ts.Node): 'public' | 'private' | 'protected' | undefined {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) return 'private';
  if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) return 'protected';
  if (hasModifier(node, ts.SyntaxKind.PublicKeyword)) return 'public';
  return undefined;
}
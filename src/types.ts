// src/types.ts - Enhanced type definitions
export interface FunctionInfo {
  name: string;
  params: ParamInfo[];
  returnType: TypeInfo;
  isAsync: boolean;
  isExported: boolean;
  isDefaultExport: boolean;
  kind: 'function' | 'arrow' | 'method' | 'constructor' | 'getter' | 'setter' | 'static';
  accessModifier?: 'public' | 'private' | 'protected';
  className?: string;
  isStatic?: boolean;
  decorators?: string[];
  jsdoc?: string;
  overloads?: FunctionInfo[];
}

export interface ParamInfo {
  name: string;
  type: TypeInfo;
  optional: boolean;
  defaultValue?: string;
  isDestructured: boolean;
  destructuredProps?: string[];
  isRest?: boolean;
}

export interface TypeInfo {
  raw: string;
  isUnion: boolean;
  isGeneric: boolean;
  isIntersection: boolean;
  baseType: string;
  genericTypes?: string[];
  unionTypes?: string[];
  intersectionTypes?: string[];
  isLiteral?: boolean;
  literalValue?: string | number | boolean;
  isTuple?: boolean;
  tupleTypes?: TypeInfo[];
  isNever?: boolean;
  isNull?: boolean;
  isUndefined?: boolean;
  resolvedType?: string; // For custom types/interfaces
}

export interface TestConfig {
  framework: 'jest' | 'vitest' | 'mocha';
  style: 'basic' | 'strict' | 'bdd' | 'smart';
  outputPath?: string;
  includeComments: boolean;
  generateMocks?: boolean;
  testEach?: boolean;
  customTemplate?: string;
  ignorePatterns?: string[];
}

export interface ProjectConfig {
  framework?: 'jest' | 'vitest' | 'mocha';
  style?: 'basic' | 'strict' | 'bdd' | 'smart';
  includeComments?: boolean;
  generateMocks?: boolean;
  testEach?: boolean;
  outputPattern?: string;
  ignorePatterns?: string[];
  typeResolution?: {
    paths?: Record<string, string[]>;
    baseUrl?: string;
  };
}

export interface MockInfo {
  moduleName: string;
  functionName: string;
  isDefault?: boolean;
  mockType: 'function' | 'class' | 'object';
  returnType?: TypeInfo;
}



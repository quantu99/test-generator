import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { TypeInfo } from './types';

export class TypeResolver {
  private program?: ts.Program;
  private checker?: ts.TypeChecker;
  private projectRoot: string;
  private disposed = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.initializeTypeChecker();
  }

  private initializeTypeChecker() {
    try {
      const tsConfigPath = ts.findConfigFile(
        this.projectRoot,
        ts.sys.fileExists,
        'tsconfig.json'
      );

      if (tsConfigPath) {
        const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
        const parsedConfig = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(tsConfigPath)
        );
        
        this.program = ts.createProgram(
          parsedConfig.fileNames,
          parsedConfig.options
        );
        this.checker = this.program.getTypeChecker();
      }
    } catch (error) {
      // If TypeScript compiler API fails, continue without type resolution
      if (process.env.DEBUG) {
        console.warn('⚠️  Type resolution disabled:', error);
      }
    }
  }

  /**
   * Dispose resources to prevent memory leaks
   */
  public dispose(): void {
    if (this.disposed) return;
    
    this.program = undefined;
    this.checker = undefined;
    this.disposed = true;
  }

  /**
   * Check if resolver is disposed
   */
  public isDisposed(): boolean {
    return this.disposed;
  }

  resolveType(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): TypeInfo {
    if (this.disposed) {
      throw new Error('TypeResolver has been disposed');
    }

    if (!typeNode) {
      return {
        raw: 'any',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'any',
      };
    }

    if (!this.checker) {
      return this.fallbackTypeInfo(typeNode);
    }

    try {
      const type = this.checker.getTypeFromTypeNode(typeNode);
      if (!type) {
        return this.fallbackTypeInfo(typeNode);
      }
      return this.typeToTypeInfo(type, typeNode.getText());
    } catch (error: any) {
      // Fallback to basic parsing if type resolution fails
      return this.fallbackTypeInfo(typeNode);
    }
  }

  private typeToTypeInfo(type: ts.Type, raw: string): TypeInfo {
    if (!type || !this.checker) {
      return {
        raw: raw || 'any',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: raw || 'any',
      };
    }

    try {
      const flags = type.getFlags();
      
      // Handle never type
      if (flags & ts.TypeFlags.Never) {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'never',
          isNever: true,
        };
      }

      // Handle null/undefined
      if (flags & ts.TypeFlags.Null) {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'null',
          isNull: true,
        };
      }

      if (flags & ts.TypeFlags.Undefined) {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'undefined',
          isUndefined: true,
        };
      }

      // Handle union types
      if (type.isUnion()) {
        const unionTypes = type.types.map(t => this.checker!.typeToString(t));
        return {
          raw,
          isUnion: true,
          isGeneric: false,
          isIntersection: false,
          baseType: unionTypes[0],
          unionTypes,
        };
      }

      // Handle intersection types
      if (type.isIntersection()) {
        const intersectionTypes = type.types.map(t => this.checker!.typeToString(t));
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: true,
          baseType: intersectionTypes[0],
          intersectionTypes,
        };
      }

      // Handle literal types
      if (flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral)) {
        const value = (type as ts.LiteralType).value;
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: typeof value,
          isLiteral: true,
          literalValue: value as string | number | boolean,
        };
      }

      // Handle tuple types
      if (this.checker!.isTupleType(type)) {
        const tupleType = type as ts.TupleType;
        let elementTypes: ts.Type[] = [];
        
        try {
          // Try multiple ways to get tuple element types
          if ('elementTypes' in tupleType && Array.isArray((tupleType as any).elementTypes)) {
            elementTypes = (tupleType as any).elementTypes;
          } else if ('target' in tupleType && (tupleType as any).target) {
            const target = (tupleType as any).target;
            if (target && 'elementTypes' in target && Array.isArray(target.elementTypes)) {
              elementTypes = target.elementTypes;
            }
          }
          
          // Fallback: try to get from type arguments
          if (elementTypes.length === 0 && 'typeArguments' in tupleType) {
            const typeArgs = (tupleType as any).typeArguments;
            if (Array.isArray(typeArgs)) {
              elementTypes = typeArgs;
            }
          }
        } catch (e) {
          // If we can't get element types, continue with empty array
          if (process.env.DEBUG) {
            console.warn('Failed to extract tuple element types:', e);
          }
        }
        
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'tuple',
          isTuple: true,
          tupleTypes: elementTypes.map((t: ts.Type) => ({
            raw: this.checker!.typeToString(t),
            isUnion: false,
            isGeneric: false,
            isIntersection: false,
            baseType: this.checker!.typeToString(t),
          })),
        };
      }

      // Handle generic types
      const symbol = type.getSymbol();
      if (symbol) {
        const typeName = symbol.getName();
        
        // Check if it's a generic type reference
        if (type.aliasSymbol) {
          const aliasTypeArgs = type.aliasTypeArguments;
          if (aliasTypeArgs && aliasTypeArgs.length > 0) {
            return {
              raw,
              isUnion: false,
              isGeneric: true,
              isIntersection: false,
              baseType: typeName,
              genericTypes: aliasTypeArgs.map(t => this.checker!.typeToString(t)),
            };
          }
        }

        // Check for generic type parameters
        const typeArgs = (type as any).typeArguments;
        if (typeArgs && Array.isArray(typeArgs) && typeArgs.length > 0) {
          return {
            raw,
            isUnion: false,
            isGeneric: true,
            isIntersection: false,
            baseType: typeName,
            genericTypes: typeArgs.map((t: ts.Type) => this.checker!.typeToString(t)),
          };
        }

        // Resolve custom types/interfaces
        const resolvedType = this.resolveCustomType(symbol);
        if (resolvedType) {
          return {
            raw,
            isUnion: false,
            isGeneric: false,
            isIntersection: false,
            baseType: typeName,
            resolvedType,
          };
        }
      }

      try {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: this.checker!.typeToString(type),
        };
      } catch (error: any) {
        // Fallback if typeToString fails
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: raw,
        };
      }
    } catch (error: any) {
      // Fallback if anything fails in typeToTypeInfo
      if (process.env.DEBUG) {
        console.warn('Type resolution failed, using fallback:', error.message);
      }
      return {
        raw: raw || 'any',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: raw || 'any',
      };
    }
  }

  private resolveCustomType(symbol: ts.Symbol): string | undefined {
    try {
      const declarations = symbol.getDeclarations();
      if (!declarations || declarations.length === 0) {
        return undefined;
      }

      const declaration = declarations[0];
      if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
        // Return a simplified representation
        const text = declaration.getText();
        return text.length > 200 ? text.substring(0, 200) + '...' : text;
      }

      return undefined;
    } catch (e) {
      if (process.env.DEBUG) {
        console.warn('Failed to resolve custom type:', e);
      }
      return undefined;
    }
  }

  private fallbackTypeInfo(typeNode: ts.TypeNode): TypeInfo {
    const raw = typeNode.getText();
    
    // Basic parsing without TypeScript compiler API
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

    if (ts.isTupleTypeNode(typeNode)) {
      const tupleTypes = typeNode.elements.map(t => this.fallbackTypeInfo(t));
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

    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: false,
      baseType: raw,
    };
  }

  /**
   * Infer type from variable usage patterns
   */
  private inferTypeFromUsage(node: ts.Node): TypeInfo {
    const usages: string[] = [];
    
    function visit(n: ts.Node) {
      if (ts.isPropertyAccessExpression(n)) {
        usages.push(n.name.getText());
      }
      if (ts.isCallExpression(n)) {
        usages.push('callable');
      }
      if (ts.isElementAccessExpression(n)) {
        usages.push('indexable');
      }
      ts.forEachChild(n, visit);
    }
    
    const parent = node.parent;
    if (parent) {
      visit(parent);
    }
    
    // Infer from usage patterns
    if (usages.includes('length') && (usages.includes('push') || usages.includes('pop'))) {
      return { 
        raw: 'Array<unknown>', 
        baseType: 'Array', 
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        genericTypes: ['unknown']
      };
    }
    
    if (usages.includes('then') && usages.includes('catch')) {
      return { 
        raw: 'Promise<unknown>', 
        baseType: 'Promise',
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        genericTypes: ['unknown']
      };
    }
    
    if (usages.includes('size') && (usages.includes('set') || usages.includes('get'))) {
      return { 
        raw: 'Map<unknown, unknown>', 
        baseType: 'Map',
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        genericTypes: ['unknown', 'unknown']
      };
    }
    
    return { 
      raw: 'unknown', 
      baseType: 'unknown',
      isUnion: false,
      isGeneric: false,
      isIntersection: false
    };
  }
}
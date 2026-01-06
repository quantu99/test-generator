import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { TypeInfo } from './types';

export class TypeResolver {
  private program?: ts.Program;
  private checker?: ts.TypeChecker;
  private projectRoot: string;

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
      console.warn('⚠️  Type resolution disabled:', error);
    }
  }

  resolveType(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): TypeInfo {
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
    if (flags & ts.TypeFlags.StringLiteral || flags & ts.TypeFlags.NumberLiteral) {
      const value = (type as ts.LiteralType).value;
      return {
        raw,
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: typeof value,
        isLiteral: true,
        literalValue: value as string | number,
      };
    }

    // Handle tuple types
    if (this.checker!.isTupleType(type)) {
      const tupleType = type as ts.TupleType;
      // Get tuple element types - TypeScript API may vary
      let elementTypes: ts.Type[] = [];
      try {
        // Try to access elementTypes if available
        if ('elementTypes' in tupleType && Array.isArray((tupleType as any).elementTypes)) {
          elementTypes = (tupleType as any).elementTypes;
        } else if ('target' in tupleType && (tupleType as any).target) {
          // Alternative way to get tuple elements
          const target = (tupleType as any).target;
          if (target && 'elementTypes' in target) {
            elementTypes = target.elementTypes || [];
          }
        }
      } catch {
        // If we can't get element types, use a fallback
        elementTypes = [];
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
      if (typeArgs && typeArgs.length > 0) {
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
        return declaration.getText().substring(0, 200);
      }

      return undefined;
    } catch {
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
}

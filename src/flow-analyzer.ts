import * as ts from 'typescript';

export interface FlowAnalysis {
  conditions: ConditionInfo[];
  loops: LoopInfo[];
  errorHandling: ErrorInfo[];
  externalCalls: CallInfo[];
  returnStatements: ReturnInfo[];
  complexity: number;
}

export interface ConditionInfo {
  type: 'if' | 'switch' | 'ternary';
  condition: string;
  consequence: string;
  alternative?: string;
  line: number;
}

export interface LoopInfo {
  type: 'for' | 'while' | 'forEach' | 'map' | 'filter' | 'reduce';
  variable?: string;
  line: number;
}

export interface ErrorInfo {
  type: 'throw' | 'try-catch' | 'reject';
  errorType?: string;
  errorMessage?: string;
  line: number;
}

export interface CallInfo {
  functionName: string;
  isAsync: boolean;
  line: number;
}

export interface ReturnInfo {
  type: string;
  condition?: string;
  line: number;
}

export function analyzeBusinessFlow(
  sourceCode: string,
  functionName: string
): FlowAnalysis {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const analysis: FlowAnalysis = {
    conditions: [],
    loops: [],
    errorHandling: [],
    externalCalls: [],
    returnStatements: [],
    complexity: 1,
  };

  function analyzeNode(node: ts.Node) {
    // Analyze if statements
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText();
      const consequence = node.thenStatement.getText().substring(0, 50);
      const alternative = node.elseStatement?.getText().substring(0, 50);
      
      analysis.conditions.push({
        type: 'if',
        condition,
        consequence,
        alternative,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze switch statements
    if (ts.isSwitchStatement(node)) {
      analysis.conditions.push({
        type: 'switch',
        condition: node.expression.getText(),
        consequence: `${node.caseBlock.clauses.length} cases`,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity += node.caseBlock.clauses.length;
    }

    // Analyze ternary operators
    if (ts.isConditionalExpression(node)) {
      analysis.conditions.push({
        type: 'ternary',
        condition: node.condition.getText(),
        consequence: node.whenTrue.getText(),
        alternative: node.whenFalse.getText(),
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze loops
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const variable = ts.isForOfStatement(node) || ts.isForInStatement(node)
        ? node.initializer.getText()
        : '';
      
      analysis.loops.push({
        type: 'for',
        variable,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity += 2;
    }

    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      analysis.loops.push({
        type: 'while',
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity += 2;
    }

    // Analyze array methods (forEach, map, filter, reduce)
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      
      if (ts.isPropertyAccessExpression(expression)) {
        const methodName = expression.name.getText();
        
        if (['forEach', 'map', 'filter', 'reduce', 'find', 'some', 'every'].includes(methodName)) {
          analysis.loops.push({
            type: methodName as any,
            variable: expression.expression.getText(),
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
          
          analysis.complexity++;
        }
      }
    }

    // Analyze throw statements
    if (ts.isThrowStatement(node)) {
      let errorMessage = '';
      let errorType = 'Error';
      
      if (ts.isNewExpression(node.expression)) {
        const errorClass = node.expression.expression.getText();
        errorType = errorClass;
        
        if (node.expression.arguments && node.expression.arguments.length > 0) {
          errorMessage = node.expression.arguments[0].getText().replace(/['"]/g, '');
        }
      }
      
      analysis.errorHandling.push({
        type: 'throw',
        errorType,
        errorMessage,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze try-catch blocks
    if (ts.isTryStatement(node)) {
      const errorType = node.catchClause?.variableDeclaration?.type?.getText() || 'any';
      
      analysis.errorHandling.push({
        type: 'try-catch',
        errorType,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze function calls (potential external dependencies)
    if (ts.isCallExpression(node)) {
      const functionName = node.expression.getText();
      
      // Skip built-in methods
      const builtins = ['console', 'Math', 'Date', 'JSON', 'Object', 'Array'];
      const isBuiltin = builtins.some(b => functionName.startsWith(b));
      
      if (!isBuiltin && !functionName.includes('.length') && !functionName.includes('.toString')) {
        // Check if it's an await call (async)
        const parent = node.parent;
        const isAsync = parent && ts.isAwaitExpression(parent);
        
        analysis.externalCalls.push({
          functionName,
          isAsync: !!isAsync,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      }
    }

    // Analyze return statements
    if (ts.isReturnStatement(node)) {
      const returnValue = node.expression?.getText() || 'void';
      
      // Check if return is conditional
      let condition: string | undefined;
      let current: ts.Node | undefined = node.parent;
      
      while (current) {
        if (ts.isIfStatement(current)) {
          condition = current.expression.getText();
          break;
        }
        current = current.parent;
      }
      
      analysis.returnStatements.push({
        type: returnValue,
        condition,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }

    ts.forEachChild(node, analyzeNode);
  }

  // Find the target function and analyze it
  function findAndAnalyzeFunction(node: ts.Node) {
    const isTargetFunction = 
      (ts.isFunctionDeclaration(node) && node.name?.getText() === functionName) ||
      (ts.isVariableStatement(node) && 
        node.declarationList.declarations.some(d => d.name.getText() === functionName)) ||
      (ts.isMethodDeclaration(node) && node.name?.getText() === functionName);

    if (isTargetFunction) {
      analyzeNode(node);
      return;
    }

    ts.forEachChild(node, findAndAnalyzeFunction);
  }

  findAndAnalyzeFunction(sourceFile);

  return analysis;
}
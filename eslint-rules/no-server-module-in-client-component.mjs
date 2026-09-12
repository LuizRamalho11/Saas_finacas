/**
 * Proíbe importar módulos exclusivos do servidor em arquivos "use client".
 *
 * Hoje a lista é `@/lib/prisma` (acesso ao banco) e `@/lib/env` (variáveis de
 * ambiente do servidor, incluindo segredos).
 *
 * O `no-restricted-imports` do ESLint não enxerga a diretiva: ele bloquearia o
 * import em todo o projeto, inclusive no servidor, onde ele é legítimo. Daí
 * esta regra local, que só reclama quando o arquivo é componente de cliente.
 *
 * Imports apenas de tipo (`import type`) são permitidos: somem na compilação e
 * não arrastam nada para o bundle do navegador.
 */
const SERVER_MODULES = [/^@\/lib\/prisma$/, /^@prisma\/client$/, /^@\/lib\/env$/, /(^|\/)lib\/(prisma|env)$/];

export const noServerModuleInClientComponent = {
  meta: {
    type: "problem",
    docs: {
      description: 'Proíbe importar módulos de servidor em arquivos "use client".',
    },
    schema: [],
    messages: {
      forbidden:
        'Componente de cliente não pode importar "{{ source }}": esse módulo é só de servidor e exporia banco ou segredos no navegador. Busque os dados por uma Server Action ou um Route Handler.',
    },
  },
  create(context) {
    let isClientComponent = false;

    return {
      Program(node) {
        isClientComponent = node.body.some(
          (statement) => statement.type === "ExpressionStatement" && statement.directive === "use client",
        );
      },
      ImportDeclaration(node) {
        if (!isClientComponent) return;
        if (node.importKind === "type") return;
        if (!SERVER_MODULES.some((pattern) => pattern.test(node.source.value))) return;

        context.report({ node, messageId: "forbidden", data: { source: node.source.value } });
      },
    };
  },
};

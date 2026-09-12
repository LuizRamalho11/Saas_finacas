/**
 * Proíbe importar o cliente Prisma em arquivos com a diretiva "use client".
 *
 * O `no-restricted-imports` do ESLint não enxerga a diretiva: ele bloquearia o
 * import em todo o projeto, inclusive no servidor, onde ele é legítimo. Por isso
 * esta regra local, que só reclama quando o arquivo é um componente de cliente.
 *
 * Imports apenas de tipo (`import type`) são permitidos: eles somem na compilação
 * e não arrastam o Prisma para o bundle do navegador.
 */
const FORBIDDEN = /^(@\/lib\/prisma|@prisma\/client)$|(^|\/)lib\/prisma$/;

export const noPrismaInClientComponent = {
  meta: {
    type: "problem",
    docs: {
      description: 'Proíbe importar o cliente Prisma em arquivos "use client".',
    },
    schema: [],
    messages: {
      forbidden:
        'Componente de cliente não pode importar "{{ source }}": o Prisma roda apenas no servidor e o banco ficaria exposto no navegador. Busque os dados por uma Server Action ou um Route Handler.',
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
        if (!FORBIDDEN.test(node.source.value)) return;

        context.report({ node, messageId: "forbidden", data: { source: node.source.value } });
      },
    };
  },
};

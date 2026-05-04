import { Node, mergeAttributes } from "@tiptap/core";

export const MergeTagNode = Node.create({
  name: "mergeTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (el: Element) => el.getAttribute("data-merge-tag"),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-merge-tag": attrs.key,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-merge-tag]",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: Record<string, unknown> } }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "merge-tag-chip",
        "data-merge-tag": node.attrs.key,
      }),
      `{{${node.attrs.key}}}`,
    ];
  },
});

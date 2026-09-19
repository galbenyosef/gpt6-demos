import { useEffect, useRef } from "react";
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { search, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import "./markdown-source.css";

const externalChange = Annotation.define<boolean>();
const highlighting = HighlightStyle.define([
  { tag: tags.heading, class: "cm-md-heading" },
  { tag: tags.strong, class: "cm-md-strong" },
  { tag: tags.emphasis, class: "cm-md-emphasis" },
  { tag: tags.strikethrough, class: "cm-md-strike" },
  { tag: [tags.link, tags.url], class: "cm-md-link" },
  { tag: [tags.monospace, tags.string], class: "cm-md-code" },
  {
    tag: [tags.processingInstruction, tags.meta, tags.number, tags.bool],
    class: "cm-md-marker",
  },
  { tag: [tags.keyword, tags.tagName, tags.typeName], class: "cm-md-keyword" },
  { tag: [tags.propertyName, tags.attributeName], class: "cm-md-property" },
  { tag: tags.comment, class: "cm-md-comment" },
]);

type Props = {
  value: string;
  readOnly: boolean;
  hidden?: boolean;
  label: string;
  onChange: (value: string) => void;
};

export default function MarkdownSource(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const configuration = useRef(new Compartment());
  const attributes = (readOnly: boolean, label: string) => [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({
      "aria-label": label,
      "aria-readonly": String(readOnly),
      "aria-multiline": "true",
      role: "textbox",
      tabindex: "0",
      spellcheck: "false",
    }),
  ];
  useEffect(() => {
    const { value, readOnly, label } = latest.current;
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          configuration.current.of(attributes(readOnly, label)),
          EditorState.lineSeparator.of(value.includes("\r\n") ? "\r\n" : "\n"),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(highlighting),
          lineNumbers(),
          EditorView.lineWrapping,
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          bracketMatching(),
          search({ top: true }),
          // Keep Tab available for moving between the reader's controls.
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !latest.current.readOnly &&
              !update.transactions.some((t) => t.annotation(externalChange))
            ) {
              latest.current.onChange(update.state.sliceDoc());
            }
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, []);
  useEffect(() => {
    editor.current?.dispatch({
      effects: configuration.current.reconfigure(
        attributes(props.readOnly, props.label),
      ),
    });
  }, [props.readOnly, props.label]);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.sliceDoc() !== props.value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: props.value },
        annotations: [
          externalChange.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
    }
  }, [props.value]);
  useEffect(() => {
    if (!props.hidden) {
      editor.current?.requestMeasure();
      if (!props.readOnly) editor.current?.focus();
    }
  }, [props.hidden, props.readOnly]);
  return (
    <div
      className="markdown-source"
      ref={host}
      hidden={props.hidden}
      data-readonly={props.readOnly}
    />
  );
}

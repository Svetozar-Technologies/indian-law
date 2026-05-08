import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

import {
  extractIndiaCodeMetadata,
  extractIndiaCodeSections,
  parseActSearchRows,
  parseRegionalSourceRows,
  parseSectionContentJson,
  stripTagsToText
} from "../scripts/lib/html.mjs";

test("extracts India Code metadata, PDF sources, and section references", async () => {
  const html = await readFile("tests/fixtures/indiacode-act.html", "utf8");
  const metadata = extractIndiaCodeMetadata(html, "https://www.indiacode.nic.in/handle/123456789/1367");
  const sections = extractIndiaCodeSections(html);

  assert.equal(metadata.title, "The Copyright Act, 1957");
  assert.equal(metadata.hindiTitle, "प्रतिलिप्‍यधिकार अधिनियम, 1957");
  assert.equal(metadata.sources.en.length, 2);
  assert.equal(metadata.sources.hi[0].url, "https://www.indiacode.nic.in/bitstream/123456789/1367/3/H1957-14.pdf");
  assert.deepEqual(
    sections.map((section) => [section.sectionNo, section.sectionId, section.title]),
    [
      ["1", "14503", "Short title, extent and commencement."],
      ["2", "14504", "Interpretation."]
    ]
  );
});

test("normalises section JSON HTML into plain text", () => {
  const payload = {
    content: '<span style="margin-left:15px;"></span>(1) Text<sup>1</sup></br><hr class="hr1"/>More&nbsp;text',
    footnote: '</br><hr style="border-top:1px"/>1. Footnote <i>vide</i> source</br>'
  };
  assert.deepEqual(parseSectionContentJson(payload), {
    content: "(1) Text^1\nMore text",
    footnotes: "1. Footnote vide source"
  });
});

test("parses India Code search result rows", () => {
  const html = `<tr><td headers="t1" class="evenRowEvenCol">25-Dec-2023</td><td headers="t2"><em>45</em></td><td headers="t3">The <font><b>Bharatiya Nyaya Sanhita</b></font>, 2023</td><td headers="t4"><a href="/handle/123456789/20062?view_type=search&col=123456789/1362">View...</a></td></tr>`;
  const rows = parseActSearchRows(html);
  assert.equal(rows[0].handle, "20062");
  assert.equal(rows[0].title, "The Bharatiya Nyaya Sanhita, 2023");
});

test("parses regional PDF source rows", () => {
  const html = '<tr><td>1</td><td>Copyright Act, 1957</td><td><a href="/sites/default/files/pdf/copyright.pdf">Download</a></td></tr>';
  const rows = parseRegionalSourceRows(html, "bn", "https://lddashboard.legislative.gov.in/bengali");
  assert.equal(rows[0].language, "bn");
  assert.equal(rows[0].title, "Copyright Act, 1957");
  assert.equal(rows[0].url, "https://lddashboard.legislative.gov.in/sites/default/files/pdf/copyright.pdf");
});

test("strips table and inline HTML without collapsing intended breaks", () => {
  assert.equal(stripTagsToText("<p>A&nbsp;B</p><p>C</p>"), "A B\nC");
});

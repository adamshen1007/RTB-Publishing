// Semantic compatibility fixture for the locked Typst PDF toolchain.
#set document(
  title: "PDF Toolchain Compatibility Fixture",
  author: "Fixture Author",
  keywords: ("fixture", "PDF", "accessibility"),
  date: datetime(year: 2026, month: 7, day: 28),
)
#set text(font: "Noto Serif", lang: "en", size: 10pt)

#outline(title: [Table of contents])

= Chapter one <chapter-one>

Read this #link(<table-one>)[internal link] and this
#link("https://example.com/")[external link].

- One
- Two

#figure(
  rect(width: 40pt, height: 20pt, fill: navy),
  caption: [Fixture figure caption],
  alt: "A navy rectangle used by the compatibility fixture.",
)

== Fixture values <table-one>

#table(
  columns: 2,
  table.header([Name], [Value]),
  [First], [One],
)

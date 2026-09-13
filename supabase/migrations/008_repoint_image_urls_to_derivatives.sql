-- Repoint building image_url values at the generated derivatives.
--
-- Camera originals moved out of public/ into assets/ (tracked but not deployed)
-- and are now served as pre-generated AVIF/WebP/JPEG variants, so the .jpeg
-- paths seeded by migrations 001 and 005 no longer resolve.
--
-- Values are explicit rather than computed: the fallback width is whatever the
-- optimizer produced for that source, which is below 1600 for small originals.
-- image_url is a single-URL column; the UI prefers the full responsive set
-- wherever a generated manifest entry exists.

UPDATE buildings AS b
SET image_url = v.url
FROM (VALUES
  ('human-sciences-building', '/buildings/human-sciences-building/human-sciences-building-01-1600.jpg'),
  ('larrison-hall', '/buildings/larrison-hall/larrison-hall-01-1600.jpg'),
  ('parker-1890-complex', '/buildings/parker-1890-complex/parker-1890-complex-01-1600.jpg'),
  ('parker-ag-research', '/buildings/parker-ag-research/parker-ag-research-01-1600.jpg'),
  ('stem-building', '/buildings/stem-building/stem-building-01-400.jpg'),
  ('woodward-hall', '/buildings/woodward-hall/woodward-hall-01-1600.jpg')
) AS v(id, url)
WHERE b.id = v.id
  AND b.image_url LIKE '/buildings/%.jpeg';

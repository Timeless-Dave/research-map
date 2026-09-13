-- Replace blanket authenticated write access with explicit editor membership.
--
-- 001_initial_schema.sql granted `FOR ALL TO authenticated USING (true) WITH
-- CHECK (true)` on every table. Any signed-in account — not just staff — could
-- insert, update, or delete buildings, projects, researchers, and their
-- associations. Writes now require a row in `content_editors`.

CREATE TABLE IF NOT EXISTS content_editors (
  user_id     uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'admin')),
  granted_by  uuid REFERENCES auth.users (id),
  granted_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_editors ENABLE ROW LEVEL SECURITY;

-- Editors may read the roster (to see who has access); membership is granted
-- out of band (service role / SQL console), never by the authenticated role.
CREATE POLICY "editors_read_roster" ON content_editors
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM content_editors e WHERE e.user_id = auth.uid()));

-- SECURITY DEFINER so the check itself is not subject to content_editors RLS,
-- which would otherwise recurse through the policies below.
CREATE OR REPLACE FUNCTION is_content_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM content_editors WHERE user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION is_content_editor() FROM public;
GRANT EXECUTE ON FUNCTION is_content_editor() TO authenticated;

DROP POLICY IF EXISTS "auth_write" ON buildings;
DROP POLICY IF EXISTS "auth_write" ON research_projects;
DROP POLICY IF EXISTS "auth_write" ON researchers;
DROP POLICY IF EXISTS "auth_write" ON project_researchers;

CREATE POLICY "editor_write" ON buildings
  FOR ALL TO authenticated
  USING (is_content_editor()) WITH CHECK (is_content_editor());

CREATE POLICY "editor_write" ON research_projects
  FOR ALL TO authenticated
  USING (is_content_editor()) WITH CHECK (is_content_editor());

CREATE POLICY "editor_write" ON researchers
  FOR ALL TO authenticated
  USING (is_content_editor()) WITH CHECK (is_content_editor());

CREATE POLICY "editor_write" ON project_researchers
  FOR ALL TO authenticated
  USING (is_content_editor()) WITH CHECK (is_content_editor());

-- Grant the first editor from the SQL console or a service-role script:
--   INSERT INTO content_editors (user_id, role) VALUES ('<auth.users.id>', 'admin');

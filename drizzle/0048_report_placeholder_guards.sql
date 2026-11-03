-- ADR 0049: optimistic versions for the headmaster's placeholder paragraph, the same
-- version_bump() as settings (0029). The worker has no grant on report_placeholders.
CREATE TRIGGER report_placeholders_version_bump
  BEFORE UPDATE ON public.report_placeholders
  FOR EACH ROW EXECUTE FUNCTION version_bump();

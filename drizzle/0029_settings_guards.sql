-- Optimistic versions for settings: the same version_bump() as issues (0012).
CREATE TRIGGER settings_version_bump
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION version_bump();

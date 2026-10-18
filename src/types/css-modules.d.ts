// CSS modules resolve to a map of generated class names (Next.js and Vite).
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

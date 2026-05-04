// Allow TypeScript to accept `import "./foo.css"` side-effect imports.
// Next.js handles the actual CSS processing; this declaration just tells
// the type-checker that .css files are valid modules.
declare module "*.css" {}

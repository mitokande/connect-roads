// Metro resolves an imported asset to a module id; TypeScript needs telling.
// (`wav` is already in Metro's default `assetExts`, so nothing else is needed.)
declare module "*.wav" {
  const asset: number;
  export default asset;
}

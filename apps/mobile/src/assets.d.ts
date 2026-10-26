/** Metro resolves a bundled sound to an asset id, which expo-audio accepts. */
declare module '*.wav' {
  const asset: number;
  export default asset;
}

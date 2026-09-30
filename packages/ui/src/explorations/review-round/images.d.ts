/** A picture imported for its address: the bundler serves it, the type system is told so. */
declare module '*.png' {
  const address: string
  export default address
}

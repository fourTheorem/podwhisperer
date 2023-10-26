interface Environment {
  [name: string]: string
}

/**
 * This is an alternative to using `process.env` directly. By using the exported proxy,
 * `env.BUCKET_NAME` will throw an Error if BUCKET_NAME is not defined in the environment.
 * This eliminates the need to check the existence of each environment variable where it is used.
 */
const envProxy: Environment = new Proxy({}, {
  get(_target: Record<string, string>, name: string): string {
    const value = process.env[name]
    if (!value) {
      throw new Error(`Environment variable ${name} is not set`)
    }
    return value
  }
})

export default envProxy
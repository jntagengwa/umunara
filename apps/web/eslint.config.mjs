import nextVitals from 'eslint-config-next/core-web-vitals'
import { fileURLToPath } from 'node:url'

const config = [
  { ignores: ['.next/**'] },
  ...nextVitals,
  { settings: { next: { rootDir: fileURLToPath(new URL('.', import.meta.url)) } } },
]

export default config

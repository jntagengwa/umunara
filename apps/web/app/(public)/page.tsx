import { connection } from 'next/server'
import { LegacyHomePage } from '../../components/legacy-home-page'
import { readHomeHero } from '../../lib/content-reads'

export default async function HomePage() {
  await connection()
  return <LegacyHomePage hero={await readHomeHero()} />
}

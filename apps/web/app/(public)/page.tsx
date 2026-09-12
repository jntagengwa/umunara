import { connection } from 'next/server'
import { PublicHomePage } from '../../components/home-page'
import { readHomeHero } from '../../lib/content-reads'

export default async function HomePage() {
  await connection()
  return <PublicHomePage hero={await readHomeHero()} />
}

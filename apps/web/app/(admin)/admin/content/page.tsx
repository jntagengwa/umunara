import { requirePageRole } from '../../../../lib/page-access'
import { readHomeHero } from '../../../../lib/content-reads'
import { SiteContentForm } from '../../../../features/site-content/site-content-form'

export default async function AdminContentPage() {
  await requirePageRole('editor')
  return (
    <main className="page-content" id="main-content">
      <h1>Home content</h1>
      <p>Update the welcome heading and introduction.</p>
      <SiteContentForm initialValue={await readHomeHero()} />
    </main>
  )
}

import { DonateButton } from '../../../components/donate-button'
import { StripeDonationForm } from '../../../features/donations/stripe-donation-form'

export default function GivePage() {
  return (
    <main className="page-content" id="main-content">
      <h1>Donate</h1>
      <p>
        Dear Friends in Christ, looking at our purpose and vision, it is a no-brainer to realize
        that we have a long way to go to accomplish the task that God entrusted to us. As you might
        know, our Conference Bridge providers have recently upgraded their platform which
        automatically implies that the cost will be affected. Also, we just upgraded our website and
        in the process got rid of the radio which was costing us a lot. We replaced it with a
        podcast platform which will serve our audience better when we are not live. Listeners will
        choose which message to listen to unlike before. We have also answered God’s call to help
        orphans and widows. We plan to establish a scholarship fund to help students who are in dire
        need. At Umunara, Inc we do believe that education is very important and hope to do Whatever
        we can to support those, among us, who need support. Hence, Umunara, Inc. is requesting
        those who want to partner with us to fulfil the Great Commission to support us by:
      </p>
      <ul>
        <li>
          Sending a check or money order to Umunara, Inc P.O BOX 505194, CHELSEA, MA 02150, USA.
        </li>
        <li>Donating through PayPal.</li>
      </ul>
      <p>
        <strong>EVERY PENNY OF YOUR DONATION GOES TO THE WORK OF GOD</strong>
      </p>
      <DonateButton />
      <StripeDonationForm />
    </main>
  )
}

export function DonateButton() {
  return (
    <form
      action="https://www.paypal.com/donate"
      method="post"
      target="_blank"
      rel="noopener noreferrer"
    >
      <input type="hidden" name="hosted_button_id" value="KTYR3LCAUW7VL" />
      <button type="submit">Donate with PayPal</button>
    </form>
  )
}

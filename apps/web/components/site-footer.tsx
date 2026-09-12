export function SiteFooter() {
  return (
    <footer className="site-footer">
      <section className="footer-vision">
        <p className="section-label">Our vision</p>
        <h2>Our Vision</h2>
        <p>
          We hope to build a Strong and God-fearing Community that will be the beacon of ever
          lasting peace and unity in our region, rooted in Jesus and held together by Faith and the
          Holy Spirit.
        </p>
        <p>We hope to spread the good news of our Lord’s resurrection and prepare all nations for his return.</p>
      </section>
      <section className="footer-contact">
        <p className="section-label">Keep in touch</p>
        <h2>Contact Us</h2>
        <address>
          <a href="mailto:postmaster@umunara.org">postmaster@umunara.org</a>
          <br />
          <a href="tel:+16174168715">+1 (617) 416-8715</a>
          <br />
          P.O. Box 505194, Chelsea, MA 02150, USA
        </address>
        <p>
          <a href="https://www.facebook.com/umunara.prayer" target="_blank" rel="noreferrer">
            Facebook
          </a>{' '}
          ·{' '}
          <a href="https://www.youtube.com/UMUNARAINC" target="_blank" rel="noreferrer">
            YouTube
          </a>
        </p>
      </section>
      <p className="copyright">© Umunara Inc. All Rights Reserved</p>
    </footer>
  )
}

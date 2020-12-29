import React from "react";

export default function WithTitle(title, component) {
  return (
    <main className="home">
      <section className="container">
        <div className="row">
          <h1>{title}</h1>
          {component}
        </div>
      </section>
    </main>
  );
}

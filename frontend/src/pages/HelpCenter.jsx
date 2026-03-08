const faqs = [
  {
    question: 'How do I create a new post?',
    answer: 'Open the Feed page and click "Create New Post". Fill out title and content, then publish.',
  },
  {
    question: 'Why can I not send messages in real time?',
    answer: 'If websocket is unavailable, the chat falls back to periodic sync. Messages are still saved and delivered.',
  },
  {
    question: 'How can I update my profile details?',
    answer: 'Open the user menu in the top-right and select "My Profile" to edit your bio and location.',
  },
];

function HelpCenter() {
  return (
    <section className="page page-account">
      <header className="account-header">
        <h1>Help Center</h1>
        <p>Answers to common questions about using InkLounge.</p>
      </header>

      <div className="help-grid">
        {faqs.map((item) => (
          <article key={item.question} className="card help-item">
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default HelpCenter;

import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="be-page-fallback">
      <h1>Page not found</h1>
      <p>The requested screen is not wired in this clean portal package.</p>
      <Link to="/dashboard">Back to Dashboard</Link>
    </div>
  );
}

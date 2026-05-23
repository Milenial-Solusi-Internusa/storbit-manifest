import { Component } from 'react';

const PASTEL = {
  rose: '#F5C8D5',
  roseDeep: '#D89AB0',
  cream: '#FAF6F0',
  ink: '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  line: '#EDE6DC',
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Render error caught', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="rounded-3xl border p-6 text-center"
        style={{ background: 'white', borderColor: PASTEL.line, color: PASTEL.ink }}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: PASTEL.rose, color: PASTEL.roseDeep }}
        >
          !
        </div>
        <h2 className="font-display text-xl font-semibold">
          {this.props.title || 'Section unavailable'}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: PASTEL.inkSoft }}>
          This section hit a temporary error. Retry the section, or refresh the page if the issue continues.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="mt-5 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: PASTEL.ink, color: PASTEL.cream }}
        >
          Retry
        </button>
        <p className="mt-3 text-xs" style={{ color: PASTEL.inkMute }}>
          No sensitive error details are shown here.
        </p>
      </div>
    );
  }
}

const TOKEN_REGEX =
  /(https?:\/\/[^\s]+|@[A-Za-z0-9_]{1,15}|#[\p{L}\p{N}_]+)/gu;

function renderToken(token, index) {
  if (!token) return null;

  if (/^https?:\/\//i.test(token)) {
    return (
      <span
        key={index}
        className="break-all text-vermillion underline decoration-vermillion/30 underline-offset-2"
      >
        {token}
      </span>
    );
  }

  if (token.startsWith('@') || token.startsWith('#')) {
    return (
      <span key={index} className="font-medium text-vermillion">
        {token}
      </span>
    );
  }

  return <span key={index}>{token}</span>;
}

export default function TweetText({ content = '', className = '' }) {
  const text = String(content ?? '');
  const parts = text.split(TOKEN_REGEX);

  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map(renderToken)}
    </p>
  );
}

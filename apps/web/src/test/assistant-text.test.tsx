import { render, screen } from '@testing-library/react';
import { AssistantText } from '@/components/assistant-widget';

describe('AssistantText', () => {
  it('renders product links and bold text', () => {
    render(<AssistantText text={'Try **this**: [NovaBook](/p/novabook-14-laptop)\n• second line'} />);
    expect(screen.getByRole('link', { name: 'NovaBook' })).toHaveAttribute('href', '/p/novabook-14-laptop');
    expect(screen.getByText('this').tagName).toBe('STRONG');
  });

  it('never renders HTML or external links from the model', () => {
    const { container } = render(
      <AssistantText text={'<img src=x onerror=alert(1)> [evil](https://evil.example)'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

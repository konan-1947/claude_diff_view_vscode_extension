import type { Message } from '../models/Message';

/** Plain text of a user message: text blocks joined, images and other blocks dropped */
export function userMessageText(message: Message): string {
  const content = message.message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(wrapper => {
        const block = wrapper.content;
        return block.type === 'text' ? block.text : '';
      })
      .join(' ');
  }
  return '';
}

declare global {
  interface EventTarget {
    [key: string]: any;
  }

  interface Element {
    value?: any;
    checked?: any;
    readOnly?: any;
    disabled?: any;
    click?: (...args: any[]) => any;
    getContext?: (...args: any[]) => any;
    width?: any;
    height?: any;
    dataset: DOMStringMap & Record<string, string>;
  }

  interface HTMLElement {
    [key: string]: any;
  }
}

export {};

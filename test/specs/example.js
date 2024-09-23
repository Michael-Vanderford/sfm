const { expect } = require('chai');

describe('My Electron app', () => {
    it('should have the correct title', async () => {
        const title = await browser.getTitle();
        expect(title).to.equal('sfm');
    });

    // it('should have a button that changes text when clicked', async () => {
    //     const button = await $('#myButton');
    //     await button.click();

    //     const text = await $('#myText');
    //     expect(await text.getText()).to.equal('Button was clicked!');
    // });

    // it('can access Electron APIs', async () => {
    //     const appName = await browser.electron.app('getName');
    //     expect(appName).to.equal('My Electron App');
    // });

});
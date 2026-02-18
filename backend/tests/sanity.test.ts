describe('Sanity Check', () => {
    it('should be true', () => {
        expect(true).toBe(true);
    });

    it('should be able to import app', async () => {
        const app = require('../src/index').default;
        expect(app).toBeDefined();
    });
});

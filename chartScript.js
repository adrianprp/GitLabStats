import  fs  from 'fs';
import  {ChartJSNodeCanvas}  from 'chartjs-node-canvas';

export class ChartGenerator {
    constructor(data, label, width = 600, height = 400) {
        this.data = data;
        this.label = label;
        this.configuration = {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192)',
                    borderWidth: 2
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        };
        this.chartJSNodeCanvas = new ChartJSNodeCanvas({width, height});
    }

    fillChartData() {
        for (const name in this.data) {
            this.configuration.data.labels.push(name);
            this.configuration.data.datasets[0].data.push(this.data[name].count);
        }
    }

    async createChart() {
        this.fillChartData();
        const image = await this.chartJSNodeCanvas.renderToBuffer(this.configuration);
        fs.writeFileSync(`${this.label}.png`, image);
    }
}


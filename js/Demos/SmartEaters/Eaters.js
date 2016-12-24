class Eater {
    constructor(pos, angle, chromosomeIdx) {
        this.pos = pos;
        this.angle = angle;
        this.chromosomeIdx = chromosomeIdx;
    }
    getChromosomeIdx() {
        return this.chromosomeIdx;
    }
    getPosition() {
        return this.pos;
    }
    setPosition(new_pos) {
        this.pos = new_pos;
    }
    getAngle() {
        return this.angle;
    }
    setAngle(angle) {
        this.angle = angle % (2 * Math.PI);
    }
}
class Eaters {
    constructor(cnv_selector, params) {
        this.params = params;
        this.TWO_PI = 2 * Math.PI;
        this.ticks = 0;
        this.cnv = document.querySelector(cnv_selector);
        this.ctx = this.cnv.getContext('2d');
        let choose = (a, b) => {
            if (a === null || a === undefined)
                return b;
            return a;
        };
        //default params
        this.params = params || {};
        this.params.population_size = this.params.population_size || 30;
        this.params.hidden_layers_sizes = this.params.hidden_layers_sizes || [6];
        this.params.food_count = this.params.food_count || 40;
        this.params.crossover_rate = choose(this.params.crossover_rate, 0.7);
        this.params.mutation_rate = choose(this.params.mutation_rate, 0.1);
        this.params.elite_count = choose(this.params.elite_count, 4);
        this.params.elite_copies = choose(this.params.elite_copies, 1);
        this.params.max_speed = this.params.max_speed || 2;
        this.params.max_turn_rate = this.params.max_turn_rate || 0.3;
        this.params.ticks_per_gen = this.params.ticks_per_gen || 1000;
        this.params.crossover_method = choose(this.params.crossover_method, CrossoverMethod.SINGLE_POINT);
        this.params.eater_size = this.params.eater_size || 12;
        this.params.food_size = this.params.food_size || 5;
        this.layer_sizes = [4, ...this.params.hidden_layers_sizes, 2];
        this.brain = new NeuralNet();
        this.genetics = new Darwin({
            population_size: this.params.population_size,
            rand_func: () => (Math.random() * 2) - 1,
            chromosome_length: NeuralNet.weightsCount(this.layer_sizes)
        });
        //Associate each chromosome to a Eater
        this.population = [];
        let c = 0;
        for (let chromo of this.genetics.getPopulation()) {
            this.population.push(new Eater(this.randomPos(), Math.random() * this.TWO_PI, c++));
        }
        this.spawnFood();
    }
    spawnFood() {
        this.food = [];
        for (let i = 0; i < this.params.food_count; i++)
            this.food.push(this.randomPos());
    }
    randomPos() {
        return Vector2D.rand().hadamard([this.cnv.width, this.cnv.height]);
    }
    getClosestFood(eater) {
        let closest_idx = 0, closest_dist_sq = Infinity;
        for (let i = 0; i < this.food.length; i++) {
            let dist = eater.getPosition().dist_sq(this.food[i]);
            if (dist < closest_dist_sq) {
                closest_dist_sq = dist;
                closest_idx = i;
            }
        }
        return {
            index: closest_idx,
            dist: Math.pow(closest_dist_sq, .5)
        };
    }
    tick() {
        if (++this.ticks > this.params.ticks_per_gen) {
            this.next_gen();
            this.ticks = 0;
        }
        //Update positions
        for (let eater of this.population) {
            let chromo = this.genetics.getPopulation()[eater.getChromosomeIdx()];
            this.brain.putWeights(this.layer_sizes, chromo.getBits());
            let closest_food = this.getClosestFood(eater);
            eater.closest_food_idx = closest_food.index;
            //food dir
            let [food_l, food_r] = this.food[closest_food.index].sub(eater.getPosition()).normalize().toArray();
            if (closest_food.dist < (this.params.eater_size + this.params.food_size) / 2) {
                let f = chromo.getFitness();
                chromo.setFitness(f + 1);
                this.food[closest_food.index] = this.randomPos();
            }
            //lookat
            let lookat = [
                Math.cos(eater.getAngle()),
                Math.sin(eater.getAngle())
            ];
            let [turn_left, turn_right] = this.brain.run(...lookat, food_l, food_r);
            let rot_force = MathUtils.clamp(turn_left - turn_right, -this.params.max_turn_rate, this.params.max_turn_rate);
            eater.setAngle(eater.getAngle() + rot_force);
            eater.lookat = new Vector2D(lookat[0], lookat[1]);
            eater.food_dir = new Vector2D(food_l, food_r);
            eater.getPosition().plus(eater.lookat.times(this.params.max_speed));
            let pos = eater.getPosition();
            //wrap around the borders
            if (pos.x > this.cnv.width)
                pos.x = 0;
            if (pos.x < 0)
                pos.x = this.cnv.width;
            if (pos.y > this.cnv.height)
                pos.y = 0;
            if (pos.y < 0)
                pos.y = this.cnv.height;
        }
    }
    next_gen() {
        console.log('avg', this.genetics.getAverageFitness());
        console.log('best', this.genetics.getFittest().getFitness());
        this.genetics.mate();
        this.spawnFood();
        for (let eater of this.population)
            eater.setPosition(this.randomPos());
    }
    run() {
        let update = () => {
            this.tick();
            this.render();
            requestAnimationFrame(update);
        };
        update();
    }
    render() {
        this.genetics.updateStats();
        this.ctx.clearRect(0, 0, this.cnv.width, this.cnv.height);
        //draw food
        this.ctx.fillStyle = 'rgb(52, 73, 94)';
        let fs = this.params.food_size;
        for (let f of this.food) {
            this.ctx.beginPath();
            this.ctx.fillRect(f.x - fs / 2, f.y - fs / 2, fs, fs);
            this.ctx.fill();
        }
        //draw Eaters
        let c1 = [46, 204, 113], c2 = [255, 0, 0], max = this.genetics.getFittest().getFitness();
        for (let eater of this.population) {
            let fitness = this.genetics.getPopulation()[eater.getChromosomeIdx()].getFitness();
            let c = [
                MathUtils.clamp(MathUtils.map(fitness, 0, max, c1[0], c2[0]), Math.min(c1[0], c2[0]), Math.max(c1[0], c2[0])),
                MathUtils.clamp(MathUtils.map(fitness, 0, max, c1[1], c2[1]), Math.min(c1[1], c2[1]), Math.max(c1[1], c2[1])),
                MathUtils.clamp(MathUtils.map(fitness, 0, max, c1[2], c2[2]), Math.min(c1[2], c2[2]), Math.max(c1[2], c2[2]))
            ];
            this.ctx.lineWidth = 4;
            this.ctx.fillStyle = `rgb(
                ${Math.floor(c[0])},
                ${Math.floor(c[1])},
                ${Math.floor(c[1])}
            )`;
            this.ctx.beginPath();
            let la = eater.lookat.times(this.params.eater_size).add(eater.getPosition());
            let a = la.sub(eater.getPosition()).angle();
            let b = Math.PI / 1.3;
            let u = new Vector2D(Math.cos(a + b), Math.sin(a + b));
            let v = new Vector2D(Math.cos(a - b), Math.sin(a - b));
            let p1 = eater.getPosition().add(u.times(this.params.eater_size));
            let p2 = eater.getPosition().add(v.times(this.params.eater_size));
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(la.x, la.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.fill();
        }
        this.ctx.fillStyle = 'black';
        this.ctx.fillText(`Generation: ${this.genetics.generation}`, 5, 10);
        this.ctx.fillText(`avg fitness: ${this.genetics.getAverageFitness().toFixed(4)}`, 5, 25);
        this.ctx.fillText(`best: ${this.genetics.getFittest().getFitness()}`, 5, 40);
        this.ctx.fillText(`ticks: ${this.ticks} / ${this.params.ticks_per_gen}`, 5, 55);
    }
}
let MathUtils = {
    clamp: (value, min, max) => {
        if (value >= min && value <= max)
            return value;
        if (value < min)
            return min;
        return max;
    },
    map: (value, start1, stop1, start2, stop2) => {
        return ((value - start1) / (stop1 - start1)) * (stop2 - start2) + start2;
    }
};

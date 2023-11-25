export class Point {
	x: number;
	y: number;
	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
  }
  
  get length() {
    return this.getLength();
  }
  
  addScaled(p1: Point, scale: number): Point {
    return new Point( this.x + scale * p1.x, this.y + scale * p1.y );
  };

  private getLength() {
    return Math.sqrt(this.x ** 2 + this.y ** 2)
  }
  clone() {
    return new Point(this.x, this.y)
  }
}